# Contributing

## Setup

```bash
npm install
```

Development requires Node.js 22.13 or newer for React Native 0.86 and Vitest 5. The published plugin supports Node.js 22 or newer. The end-to-end suite starts Paseo daemons from the `@getpaseo/cli` dev dependency with temporary homes and free ports; it never touches `~/.paseo` or a daemon on port 6767.

## Checks

Run these before every commit:

```bash
npm run typecheck
npm run lint        # biome; `npm run format` fixes formatting
npm test            # unit tests
npm run test:e2e    # real daemons, about a minute
```

`MESH_E2E_RELAY=1 npm run test:e2e` also tests connections through `relay.paseo.sh`.

## Layout rules

Paseo compiles the plugin itself and enforces its runtime boundaries:

- `index.server.ts` and `server/` run in Node. No React.
- `index.client.tsx` and `client/` run in the app. No Node built-ins; only `react`, `react-native`, `@tanstack/react-query`, `zod` and the `@getpaseo/plugin` client entries are available at runtime.
- `shared/` is imported by both and may only use `zod` and `@getpaseo/plugin`.
- No other code modules in the repository root besides the two entries and config files.

Server dependencies other than `zod` and `@getpaseo/plugin/*` are bundled from `node_modules`, so they must be in `dependencies`, not `devDependencies`.

Keep React on the host's 19.2 line and React Native on its 0.86 line; pin their exact patch versions. Keep `@types/node` on Node 22 so typechecking covers the oldest supported runtime. Development overrides cover the daemon's MCP, AI, Markdown and UUID dependencies and NYC's YAML loader. Keep Undici 6 for Node 22.13 compatibility and YAML 4 for configuration merge keys. The end-to-end suite verifies the overridden daemon too.

## Lockfile

Use npm 10 or 11 for packaging and npm artifact installs: npm 12 ignores `npm-shrinkwrap.json`, which locks the published runtime dependencies. Releases use the latest npm 11. Git installs run `npm ci --omit=dev` with whatever npm the daemon host has, so `package-lock.json` must stay installable by npm 10 (Node 22) as well as npm 11. The Node 22 CI job enforces this. The `esbuild` dev dependency keeps vite's optional peer resolution consistent between those npm versions.

## Tests

Add behavior tests to the existing suites: unit tests next to the module (`server/**/*.test.ts`), end-to-end tests in `test/e2e/mesh.e2e.test.ts`. If a scenario needs new agent behavior, extend the echo provider in `test/fixtures/echo-provider` instead of using a real model.

## Releases

See [docs/release.md](docs/release.md).
