import { type ExecFileOptions, execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createPaseoApi, type PaseoApi } from "@getpaseo/client";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { hashDaemonPassword } from "@getpaseo/server/auth";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { PASEO_CLIENT_APP_VERSION } from "../../shared/version";

const exec = promisify(execFile);
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const ECHO_PROVIDER_DIR = path.join(ROOT, "test/fixtures/echo-provider");
export const ECHO_MODEL = "mesh-echo/echo-1";
const PASEO_BIN = path.join(ROOT, "node_modules/.bin/paseo");

/** Environment for child CLIs: no inherited PASEO_* (this suite may itself run inside Paseo). */
function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("PASEO_")) env[key] = value;
  }
  return { ...env, CI: "true", ...extra };
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as net.AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

export interface StartOptions {
  name: string;
  plugins: string[];
  password?: string;
  relay?: boolean;
  /** Extra environment for the daemon and its plugins. */
  env?: Record<string, string>;
}

export class TestDaemon {
  private clients: DaemonClient[] = [];
  serverId = "";

  private constructor(
    readonly name: string,
    readonly home: string,
    readonly port: number,
    readonly password: string | undefined,
    private readonly env: Record<string, string>,
  ) {}

  static async start(options: StartOptions): Promise<TestDaemon> {
    const home = mkdtempSync(path.join(os.tmpdir(), `mesh-e2e-${options.name}-`));
    const port = await freePort();
    const daemon = new TestDaemon(options.name, home, port, options.password, options.env ?? {});
    await writeFile(
      path.join(home, "config.json"),
      JSON.stringify({
        daemon: {
          listen: `127.0.0.1:${port}`,
          relay: { enabled: options.relay ?? false },
          ...(options.password ? { auth: { password: hashDaemonPassword(options.password) } } : {}),
        },
        features: { dictation: { enabled: false }, voiceMode: { enabled: false } },
        pluginsEnabled: true,
      }),
    );
    await daemon.startProcess();
    for (const plugin of options.plugins) await daemon.installPlugin(plugin);
    daemon.serverId = (await readFile(path.join(home, "server-id"), "utf8")).trim();
    return daemon;
  }

  get endpoint(): string {
    return `127.0.0.1:${this.port}`;
  }

  async cli(args: string[], options: ExecFileOptions = {}): Promise<string> {
    const { stdout } = await exec(PASEO_BIN, ["--home", this.home, ...args], {
      env: cleanEnv(),
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    });
    return String(stdout);
  }

  async startProcess(): Promise<void> {
    await this.cli(["daemon", "start", "--timeout", "120"], { env: cleanEnv(this.env) });
  }

  async stopProcess(): Promise<void> {
    await this.closeClients();
    await this.cli(["daemon", "stop", "--timeout", "20", "--force"]).catch(() => {});
  }

  async installPlugin(dir: string): Promise<void> {
    await this.cli(["plugin", "install", dir, "--json"]);
  }

  async reloadPlugin(id: string): Promise<void> {
    await this.cli(["plugin", "reload", id, "--json"]);
    if (id === "mesh") await this.waitForMesh();
  }

  /** Mesh starts asynchronously after the plugin reports ready; wait for its MCP endpoint. */
  async waitForMesh(): Promise<void> {
    await waitFor(
      async () => {
        const { port } = await this.meshServer();
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        return response.ok;
      },
      { timeoutMs: 30_000, message: "mesh MCP endpoint never came up" },
    );
  }

  async pluginLogs(id: string): Promise<string> {
    return this.cli(["plugin", "logs", id]);
  }

  async client(): Promise<DaemonClient> {
    const client = new DaemonClient({
      url: `ws://${this.endpoint}/ws`,
      clientId: `e2e-${this.name}-${Math.random().toString(36).slice(2)}`,
      appVersion: PASEO_CLIENT_APP_VERSION,
      ...(this.password ? { password: this.password } : {}),
      localCredential: async () => {
        try {
          return (await readFile(path.join(this.home, "local-credential"), "utf8")).trim();
        } catch {
          return undefined;
        }
      },
    });
    await client.connect();
    await client.fetchAgents({});
    this.clients.push(client);
    return client;
  }

  async api(): Promise<PaseoApi> {
    return createPaseoApi(await this.client());
  }

  async rpc<T = unknown>(method: string, input: unknown): Promise<T> {
    const client = await this.client();
    try {
      return (await client.invokePluginRpc("mesh", method, input)) as T;
    } finally {
      await client.close().catch(() => {});
      this.clients = this.clients.filter((candidate) => candidate !== client);
    }
  }

  meshDataDir(): string {
    return path.join(this.home, "paseo-mesh");
  }

  async meshServer(): Promise<{ port: number; token: string }> {
    return JSON.parse(await readFile(path.join(this.meshDataDir(), "server.json"), "utf8"));
  }

  /** Reads the stored agent record, including the injected MCP config. */
  async agentRecord(agentId: string): Promise<{
    config: { mcpServers?: Record<string, { url: string; headers?: Record<string, string> }> };
  }> {
    const root = path.join(this.home, "agents");
    for (const dir of await readdir(root)) {
      const file = path.join(root, dir, `${agentId}.json`);
      try {
        return JSON.parse(await readFile(file, "utf8"));
      } catch {}
    }
    throw new Error(`No record for agent ${agentId}`);
  }

  /** MCP client acting as the given local agent (or anonymously). */
  async mcp(agentId?: string): Promise<McpClient> {
    let url: string;
    let headers: Record<string, string>;
    if (agentId) {
      const mesh = (await this.agentRecord(agentId)).config.mcpServers?.mesh;
      if (!mesh) throw new Error(`Agent ${agentId} has no mesh MCP server`);
      url = mesh.url;
      headers = mesh.headers ?? {};
    } else {
      const server = await this.meshServer();
      url = `http://127.0.0.1:${server.port}/mcp`;
      headers = { Authorization: `Bearer ${server.token}` };
    }
    const client = new McpClient({ name: "e2e", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }),
    );
    return client;
  }

  async closeClients(): Promise<void> {
    const clients = this.clients;
    this.clients = [];
    await Promise.all(clients.map((client) => client.close().catch(() => {})));
  }

  async destroy(): Promise<void> {
    await this.stopProcess();
    await rm(this.home, { recursive: true, force: true }).catch(() => {});
  }
}

/** Calls a mesh tool and returns its structured result, throwing on tool errors. */
export async function callTool<T = Record<string, unknown>>(
  client: McpClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const text = (result.content as Array<{ text?: string }>).map((part) => part.text).join("\n");
    throw new Error(text);
  }
  return result.structuredContent as T;
}

/** Calls a mesh tool expecting a tool error; returns its message. */
export async function callToolError(
  client: McpClient,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  if (!result.isError)
    throw new Error(`Expected ${name} to fail: ${JSON.stringify(result.structuredContent)}`);
  return (result.content as Array<{ text?: string }>).map((part) => part.text).join("\n");
}

export async function waitFor<T>(
  check: () => Promise<T | null | undefined | false> | T | null | undefined | false,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
): Promise<T> {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, options.intervalMs ?? 250));
  }
  throw new Error(
    `${options.message ?? "Condition not met"}${lastError ? `: ${String(lastError)}` : ""}`,
  );
}

/** Creates an echo agent and waits for its first turn. */
export async function createEchoAgent(
  api: PaseoApi,
  options: { cwd: string; title: string; prompt: string },
): Promise<string> {
  const workspace = await api.workspaces.open(options.cwd);
  const agent = await workspace.agents.create({
    config: { provider: ECHO_MODEL },
    title: options.title,
    prompt: options.prompt,
  });
  await agent.waitForFinish(60_000);
  return agent.id;
}

/** User and assistant messages of an agent, oldest first. */
export async function messages(api: PaseoApi, agentId: string): Promise<string[]> {
  const timeline = await api.agents.ref(agentId).timeline.refetch({ direction: "tail", limit: 0 });
  return timeline.entries
    .map((entry) => entry.item)
    .filter((item) => item.type === "user_message" || item.type === "assistant_message")
    .map((item) => ("text" in item ? String(item.text) : ""));
}

export function tempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), `mesh-e2e-${prefix}-`));
}
