# Upstream WIT dependencies

The analysis component uses dependencies fetched into
`wkg/wit/deps` from GitHub without editing their contents. The Rust task pins commit
`736c46d8eb7eae6ff766e83a7401a4a36f5a9601`, the latest upstream HEAD verified on
2026-09-27. Builds reuse this revision; they do not silently follow a moving branch.

| Upstream file       | Resolved dependency                       |
| ------------------- | ----------------------------------------- |
| `wit/websocket.wit` | `polymorph-websocket-0.1.0/websocket.wit` |
| `LICENSE`           | `LICENSE.polymorph-websocket`             |

The WebSocket WIT and license come from the same upstream repository revision.
`wkg/wit/world.wit` defines the imports-only
`apple-code:build-dependencies/dependencies@0.1.0` build world so `wkg` can resolve
the package independently of the application world. The analysis component
loads the fetched package directories alongside its own WIT in
`crates/workbench/component/wit`; it does not compile the build world.

```text
pnpm wit:fetch
  → Rust xtask downloads the pinned GitHub files into wkg/vendor
  → wkg fetch wit --type wasm (from wkg) resolves them into wkg/wit/deps
  → Rust compares the resolved files with the downloaded bytes
  → wit-bindgen reads those unchanged files during component compilation
```

The output option is deliberately **`--type wasm`**. In wkg 0.16.0 this
copies local WIT overrides unchanged, retaining their filenames; `--type wit`
reprints the parsed interfaces and changes Polymorph's formatting. With these
local overrides, the output remains `.wit` text. No postprocessing is performed.

`wkg.toml` redirects dependency resolution to the downloaded files because no
upstream WIT registry publication has been verified. These overrides do not
modify WIT content. Local overrides leave `wkg.lock` with `packages = []`, so the
GitHub pin lives in `xtask/src/main.rs`, not in that lockfile. Registry-backed
dependencies can use wkg normally when available; their byte identity with
GitHub source must be qualified separately.

## Fetch and check

Install Rust, curl and `cargo install wkg --version 0.16.0 --locked`, then run:

```sh
pnpm wit:fetch
pnpm wit:check
pnpm engine:build
```

The engine build runs `wit:fetch` first. Before a direct Cargo build
for Wasm, run `pnpm wit:fetch` yourself. Handwritten component WIT and filesystem
interfaces remain with their owning components; `wkg` never overwrites those
application contracts.

Downloading uses curl's binary stdout, and Rust writes those bytes directly:
no text decoding, newline conversion, formatting or handwritten replacement
definitions. Every download must succeed before local sources are replaced.
Network access is required for each fetch. These are build tools, not
analysis/runtime dependencies.

`wit:check` snapshots the resolved dependencies and lockfile, fetches again, then
fails if they changed. It refreshes files even when reporting drift; it is not a
read-only command. Cargo's `--locked` applies to `Cargo.lock`, not to wkg resolution.

Both downloaded sources and resolved dependencies are ignored here: they are
reproducible build inputs. The formatter ignores them too. Commit our world, task,
configuration and lockfile.
The `wkg/wit/deps` directory is owned entirely by this task: wkg recreates it
on each fetch. Do not store handwritten files there.

To update, verify the latest upstream commit, update `REVISION` and any changed
package paths/versions, then fetch and review the result. The TypeScript provider
and WIT package have separate version numbers; check compatibility when updating.

Sources:

- [Pinned upstream repository](https://github.com/polymorph-components/polymorph-websocket/tree/736c46d8eb7eae6ff766e83a7401a4a36f5a9601)
- [wkg 0.16.0 local dependency output](https://github.com/bytecodealliance/wasm-pkg-tools/blob/v0.16.0/crates/wasm-pkg-core/src/wit.rs#L361-L377)
