# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1] - 2026-11-03

### Changed

- Upgrade the bundled Paseo client and protocol to 0.15.0 and align the client handshake version.
- Update development dependencies, keeping React 19.2 and React Native 0.86 aligned with the Paseo host and Node types on the supported Node 22 runtime.

### Fixed

- Use Node's URL implementation for server connection parsing to avoid conflicting React Native URL declarations.

## [0.2.0] - 2026-10-19

### Added

- `mesh_exec` runs shell scripts directly on POSIX hosts and returns combined stdout/stderr, the exit code, captured output on timeout, and output truncation status in one call. Supports local execution and peers over direct connections, SSH tunnels and encrypted Relay.
- Separate shell execution opt-in for each peer and the local host, disabled by default and managed from Mesh settings or the CLI. Execution also requires write access; allowed paths constrain the initial working directory.
- Automatic cleanup of temporary terminals on completion, errors, timeout, cancellation and plugin shutdown, with a remote watchdog and abandoned-terminal recovery after reconnect or reload.
- MCP cancellation notifications stop running scripts and release their temporary terminals.

## [0.1.4] - 2026-10-15

### Added

- App host sync: mesh keeps its peers in step with the Paseo app's Hosts list (desktop and web), adding, updating and removing the hosts the app manages. Works on every host running mesh, including headless servers reached from the app. Off by default.
- `ssh://[user@]host[:port]?daemonPort=` peers, connected with `ssh -W` and the daemon user's SSH keys.
- `mesh.self.describe`, which hands a daemon's own pairing offer to other hosts' syncs.
- Peers pinned to a server ID refuse a connection that reaches a different daemon.

## [0.1.3] - 2026-10-15

### Added

- Messages from `mesh_send_prompt` and `mesh_create_agent` start with the sending agent and a reply address, so agents on two mesh hosts can hold a conversation. `includeSender: false` sends the bare prompt.
- The Peers settings screen lists hosts the app is connected to that mesh cannot reach yet, with where to copy their pairing link and a prefilled name.

### Fixed

- An agent asked about a host that is not a mesh peer now gets clear instructions to ask the user to add it, instead of a bare list that led agents to improvise through UI automation.

## [0.1.2] - 2026-10-15

### Fixed

- The npm package ships `npm-shrinkwrap.json`, so npm installs get the same exact runtime dependency tree as Git installs. The Paseo plugin directory requires this for npm artifacts.
- A config reload triggered by the plugin's own write could apply a stale file over a newer peer update, briefly reverting settings such as allowed paths. Reloads and updates are now serialized.

### Changed

- README: install from the Paseo plugin directory with `paseo plugin add jtsang4/mesh`.

## [0.1.1] - 2026-10-15

### Changed

- README: install from npm and run the CLI with `npx paseo-mesh`.
- Release documentation for npm trusted publishing and npm's review of new versions.
- First release published from GitHub Actions through npm trusted publishing, with provenance.

## [0.1.0] - 2026-10-15

### Added

- `mesh` MCP server injected into new agents, with `mesh_list_hosts`, `mesh_list_workspaces`, `mesh_list_agents`, `mesh_get_agent`, `mesh_read_timeline`, `mesh_list_providers`, `mesh_create_agent`, `mesh_send_prompt`, `mesh_wait_agent`, `mesh_respond_permission`, `mesh_stop_agent` and `mesh_archive_agent`.
- Peers over pairing offers, `relay://` URIs (end-to-end encrypted relay) and direct `host:port` / `ws://` / `wss://` connections with optional daemon passwords.
- Identity checks for every connection: offer/server mismatch, self loops and duplicate peers.
- Supervised reconnects with exponential backoff; config changes applied as a diff keyed by stable peer IDs, so renames keep connections and pending work.
- Finish, error and permission notifications for remote agents, persisted across plugin reloads, daemon restarts, disconnects and peer removal.
- Per-peer read/write access and allowed paths.
- Mesh screen, Peers settings screen and Command Center entries in the Paseo app.
- `paseo-mesh` CLI for headless peer management.

[Unreleased]: https://github.com/jtsang4/paseo-mesh/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/jtsang4/paseo-mesh/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jtsang4/paseo-mesh/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/jtsang4/paseo-mesh/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/jtsang4/paseo-mesh/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/jtsang4/paseo-mesh/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/jtsang4/paseo-mesh/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/jtsang4/paseo-mesh/releases/tag/v0.1.0
