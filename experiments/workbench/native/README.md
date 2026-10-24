# Native Rust remote filesystem client

Direct native analysis composes [`filesystem_native::NativeSelection`](../../../crates/filesystem/native/src/selection.rs),
a borrowed [`NativeFileSource`](../../../crates/filesystem/native/src/file.rs) and
`binary_inspection::inspect_source` in the same process. That path requires no
remote client, service, WebSocket, async runtime, JavaScript or component runtime.

Optional remote access uses the reusable
[`workbench-operations`](../../../crates/workbench/operations/src/lib.rs) crate.
It owns remote sessions, selection-state projection, protocol validation, repeated
bounded reads and operation composition. It accepts a
`Transport` implementation and has no native networking or runtime dependencies.

This experiment owns the native
[`NativeTransport`](src/socket/native.rs) adapter and its Tokio/WebSocket
dependencies. Native callers compose
`Session::new` with `Box::new(NativeTransport::new(endpoint)?)`.
The native inspection example uses that composition without JavaScript, Node,
WIT or a component runtime:

```sh
cargo run --locked -p workbench-native --example inspect -- \
  ws://127.0.0.1:PORT
```

`Session::current_selection()` queries native-owned names, identifiers and the
captured listing. `Session::query_selection()` returns that query as one completed
step. Selection and navigation methods return `SelectionOutcome` with an action
step followed by a query step, each retaining its kind and original result.
Unavailable state is distinct from an empty owner. Lost replies do not trigger
acquisition replay or rollback, and every identifier remains subject to service
validation. See the [Rust outcome contract](../../../docs/architecture/rust-runtime-independence/README.md#public-apis-and-component-boundaries)
for the shared structures and component projection.
`Session::inspect` feeds bounded remote reads into the existing
`binary_inspection::inspect_source` API and returns one `Inspect` step containing
the report or original failure. The call has no progress notifications or analysis
cancellation checks.

The service retains selection across inspection and disconnect until
successful replacement or shutdown. There is no frontend deselection or remote
cleanup operation. The direct native composition example can inspect the same
retained source repeatedly without this client:

```sh
cargo run --locked -p filesystem-native --example inspect_selection -- /path/to/file
```

The main [`workbench-component`](../../../crates/workbench/component/wit/native.wit)
exports that session API through WIT and uses the shared Rust application address.
This native experiment retains explicit endpoint arguments.
The component socket adapter imports the unchanged
upstream Polymorph WebSocket interface. Browser code supplies environment networking,
component-value conversion and local runtime disposal.
The selected browser path uses jco and the published Polymorph provider.

See [async helpers and runtime ownership](../../../docs/architecture/rust-runtime-independence/filesystem-communication-flow.md#async-helpers-and-runtime-ownership)
for the `futures-rs` dependency, the helpers used here, and the distinction between
component execution and native Tokio networking.

## Shared protocol

[`filesystem-protocol`](../../../crates/filesystem/protocol/src/lib.rs)
defines the owned request/response types. The selected WebSocket backend parses
and connects to the endpoint; the client adds no custom URL admission rules.
Adapters retain backend failures, including the original native URI-parse
cause where available. `rmp-serde` encodes named MessagePack fields through Serde,
and `serde_bytes` preserves binary file contents. Each request and response
occupies one complete binary WebSocket message. File metadata, repeated reads and
selection/directory operations share a persistent socket.
A transport or protocol failure discards that socket; a later operation can
reconnect. Ambiguous requests are not automatically replayed.

Rust enforces resource identifier syntax, message and field bounds,
range arithmetic, expected response variant and read length. It checks the frame size
before allocating owned fields and rejects trailing bytes. Offsets remain exact `u64` values. The native service handles file reads, selection,
directory navigation and one persistent native selection. Its
[local access policy](../../../crates/services/filesystem/README.md) requires only the endpoint.
Client connection attempts retain their five-second bounds, and provider/library
timers remain unchanged. Selection and filesystem exchanges have no application
deadline; the service retains its handshake, reply and protocol-flush bounds.

## Native range-read probe

This experiment's `read_range(FileRequest)` accepts an endpoint, offset and
length. It queries current selection, then invokes the shared session's metadata
and range-read methods for the observed file. The ordinary API returns
`Result<FileRead, Failure>`, preserving typed validation, connection and read
failures. Both native examples use the same Rust filesystem client as the
application component.

The `read_range` executable prints the library result as
`{"read":{"Ok":...}}` or `{"read":{"Err":...}}`, with exit status 0 or 1
respectively. Errors contain `kind` and the Rust-formatted `message`.
Missing or malformed command-line arguments fail on stderr with
exit status 1. JSON serialization and stdout failures also propagate as executable
errors. Rust library functions do not decide process exit status.

```sh
cargo build --locked -p workbench-native --examples
cargo build --locked -p filesystem-service
cargo test --locked -p workbench-operations -p workbench-native
```

The `read_range` example accepts the endpoint from `filesystem-service`,
an offset and a length, then returns a read result as JSON. Start
the service with no arguments and select a file through the application's native
dialog before invoking the example:

```sh
cargo run --locked -p workbench-native --example read_range -- \
  ws://127.0.0.1:PORT 0 64
```

Shared client tests cover parser parity, malformed responses,
native-dialog cancellation, lost acquisition replies, stale
identifiers and unavailable state. Native adapter tests retain URI-parse, timer and WebSocket
backend causes. Native remote synchronous methods must run outside an entered
Tokio runtime. Dropping a client socket does not change the native owner, and
work already admitted by the service may complete after disconnect. These native
checks do not qualify browser execution or native OS panel dismissal.
