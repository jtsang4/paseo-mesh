import { URL } from "node:url";
import type { ConnectionOffer } from "@getpaseo/protocol/connection-offer";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import {
  buildDaemonWebSocketUrl,
  buildRelayWebSocketUrl,
  parseRelayConnectionUri,
  shouldUseTlsForDefaultHostedRelay,
} from "@getpaseo/protocol/daemon-endpoints";
import { parseSshTransportUri, type SshTransportTarget } from "@getpaseo/protocol/ssh-transport";

export type ConnectionTarget =
  | {
      kind: "relay";
      url: string;
      /** Identity promised by the offer; the handshake must report the same ID. */
      serverId: string;
      daemonPublicKeyB64: string;
      endpoint: string;
      /** Password embedded in a relay:// URI, used when the peer has none configured. */
      password?: string;
    }
  | { kind: "direct"; url: string; endpoint: string }
  | { kind: "ssh"; ssh: SshTransportTarget; endpoint: string };

/**
 * Accepts a pairing offer URL (`https://app.paseo.sh/#offer=...`), a `host:port` endpoint,
 * or a `ws://` / `wss://` URL. Throws with a readable message for anything else.
 */
export function parseConnectionTarget(input: string): ConnectionTarget {
  const value = input.trim();
  if (!value) throw new Error("Connection is empty");

  if (value.includes("#offer=")) {
    let offer: ReturnType<typeof parseConnectionOfferFromUrl>;
    try {
      offer = parseConnectionOfferFromUrl(value);
    } catch (error) {
      throw new Error(`Invalid pairing offer URL: ${describe(error)}`);
    }
    if (!offer) throw new Error("Invalid pairing offer URL");
    return relayTarget(offer);
  }

  if (/^relay:\/\//i.test(value) || value.includes("#connect=")) {
    let parsed: ReturnType<typeof parseRelayConnectionUri>;
    try {
      parsed = parseRelayConnectionUri(value);
    } catch (error) {
      throw new Error(`Invalid relay connection URI: ${describe(error)}`);
    }
    return relayTarget(parsed.offer, parsed.password);
  }

  if (/^ssh:\/\//i.test(value)) {
    let ssh: SshTransportTarget;
    try {
      ssh = parseSshTransportUri(value);
    } catch (error) {
      throw new Error(`Invalid SSH connection: ${describe(error)}`);
    }
    const port = ssh.sshPort ? `:${ssh.sshPort}` : "";
    return { kind: "ssh", ssh, endpoint: `ssh ${ssh.host}${port} → daemon port ${ssh.daemonPort}` };
  }

  if (/^wss?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`Invalid WebSocket URL: ${value}`);
    }
    if (url.pathname === "/" || url.pathname === "") url.pathname = "/ws";
    return { kind: "direct", url: url.toString(), endpoint: url.host };
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    throw new Error(
      "Unsupported connection. Use a pairing offer URL, relay://, ssh://, host:port, ws:// or wss://.",
    );
  }

  try {
    return {
      kind: "direct",
      url: buildDaemonWebSocketUrl(value, { useTls: false }),
      endpoint: value,
    };
  } catch (error) {
    throw new Error(`Invalid host:port endpoint "${value}": ${describe(error)}`);
  }
}

function relayTarget(offer: ConnectionOffer, password?: string): ConnectionTarget {
  return {
    kind: "relay",
    url: buildRelayWebSocketUrl({
      endpoint: offer.relay.endpoint,
      serverId: offer.serverId,
      role: "client",
      useTls: offer.relay.useTls ?? shouldUseTlsForDefaultHostedRelay(offer.relay.endpoint),
    }),
    serverId: offer.serverId,
    daemonPublicKeyB64: offer.daemonPublicKeyB64,
    endpoint: offer.relay.endpoint,
    ...(password ? { password } : {}),
  };
}

/** Display form that never includes the offer payload or key. */
export function describeConnection(target: ConnectionTarget): string {
  return target.kind === "relay"
    ? `relay ${target.endpoint} (${target.serverId})`
    : target.endpoint;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
