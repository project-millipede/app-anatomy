# Native Workbench Service

The service retains explicitly selected native files and directories. Rust
clients send bounded filesystem messages over a persistent loopback WebSocket;
the service reads only the requested ranges. Neither the service nor its
filesystem implementation requires JavaScript or a Wasm runtime. Any local client
with the endpoint may query, change and read the shared selection. Connection
credentials and Origin checks are not part of this access policy.

```mermaid
sequenceDiagram
    participant Client as Rust filesystem client
    participant Service as Native Rust service
    participant Picker as OS main-thread picker
    participant OS as Native filesystem
    Client->>Service: Choose file/folder
    Service->>Picker: Ask the user to select a path
    Picker-->>Service: Selected path or cancellation
    Service->>OS: Open and retain the selected resource
    Service-->>Client: Display name and opaque resource identifier
    Client->>Service: File length / bounded read / directory operation
    Service->>OS: Access retained native resource
    OS-->>Service: Requested bytes, entries or native error
    Service-->>Client: One typed response
    Client->>Service: Query current selection
    Service-->>Client: Current names, identifiers and captured directory listing
    Note over Service: Retain selection until successful replacement or shutdown
```

## Operations and ownership

The client and service share ordinary Rust types from
[`filesystem-protocol`](../../filesystem/protocol/src/lib.rs).
Each complete binary WebSocket message contains one MessagePack request or
response, encoded through Serde by `rmp-serde`. Struct fields and enum
variants use their names; `serde_bytes` stores file contents as binary data.
Requests execute sequentially on a connection, so one matching
response completes each operation. No text terminator or socket EOF is required.
The socket can remain open between operations and between user interactions.

- **Files:** obtain captured length and read an offset and bounded length.
- **Directories:** open a listed file or navigate to a child directory by entry
  ID. `ListDirectory` reads a retained listing; `ExpandDirectory` lazily captures
  one immediate child without changing the file or listing cursor.
- **Selection:** generic file/folder controls remain available for Base/Ark.
  Separate `ChooseApplication` and `ChooseBinary` operations establish the Explorer's
  application or standalone-binary scope. Queries include that scope, current
  file/cursor metadata, root identity and optional listed-file origin; only the
  cursor's listing is included.

The protocol never accepts a native pathname. The native picker supplies the path.
Resource identifiers are random 256-bit values encoded as
64 lowercase hexadecimal characters. They name the current file or any captured
directory under the retained root; file and directory identifiers cannot substitute
for each other. Names sent to the client are display names, not exact paths.

A selection owns one file and at most 64 captured directories, including a stable
root. Repeated expansion of the same parent entry returns its existing identity
and listing without I/O. Loaded siblings remain addressable. Selecting a listed
file changes only the file and cursor to its parent, preserving the root/tree;
`file_entry` records that parent resource and listing-scoped entry ID. Legacy
child-directory navigation moves the cursor and clears the file, retaining the
root/tree. Base/Ark consumers can continue using the current directory and entries.

Choosing an external file clears the directory tree. Choosing a folder installs a
new root. Both invalidate every old directory identity only after successful
acquisition. Failed acquisition or the 64-directory limit preserves existing
resources; there is no eviction or recursive walk. Native directory code still
owns entry resolution and link handling. Captured listings and later live-path
opens do not provide a filesystem snapshot or confinement boundary.

The reusable `filesystem_native::NativeSelection` owns this state through ordinary
Rust APIs without a service or JavaScript. The service adds opaque identifiers
and wire projections. Native-dialog cancellation preserves the existing selection.
Inspection success or failure, refresh, navigation and socket
closure do not change native ownership. Replacement, owner destruction and service
shutdown dispose resources. There is no frontend or remote deselection operation.
Replaced identifiers receive an `Unknown resource identifier` failure; identifiers
are never silently rebound to a replacement. An admitted read completes against
its original handle under the native-access lock.

The ordinary native [composition example](../../filesystem/native/examples/inspect_selection.rs)
uses `NativeSelection`, a borrowed `NativeFileSource` and `inspect_source()` with
no service, transport, JavaScript, WIT or Wasm runtime. The native library does not
own dialogs; this service invokes rfd for native presentation.

See [async helpers and runtime ownership](../../../docs/architecture/rust-runtime-independence/filesystem-communication-flow.md#async-helpers-and-runtime-ownership)
for how `futures` supplies socket helpers and test polling within the service's
Tokio runtime.

## Application and binary acquisition

`SelectionScope` distinguishes `Empty`, generic `File`/`Directory`, `Application`
and `Binary`. New owners always report a scope; older responses omit it and decode
as `None`. A generic folder, including `/Applications`, is not an Explorer application
input. Generic acquisition never gains application scope merely from its name.

On macOS, the application picker starts at `/Applications` and uses the pinned
rfd file picker with an `.app` filter, so the user selects one package. The native
adapter independently enforces the result through
[`NativeApplication`](../../filesystem/native/src/application.rs). The ordinary
[core policy](../../binary/inspection/src/application.rs) requires the raw name's
`.app` suffix, a directory root, a `Contents` directory and a regular
`Contents/Info.plist`. This supports the modern layout only; it does not parse the
plist, validate signatures or establish execution eligibility. Application scope
includes resource and other entries, not just binaries; listing and cursor changes
preserve it. Existing directory bounds and live-path limitations still apply.

The binary picker has no extension filter. `NativeBinary` opens a regular file and
runs the existing thin/universal Mach-O header inspector before installation.
Dependency inspection remains an explicit later operation. Private acquisition
wrapper fields prevent installing either validated scope around generic resources.
Cancel or validation failure preserves the previous input; successful replacement
invalidates its resources. Direct native callers use
`NativeSelection::select_application` or `select_binary` without a service or host
runtime.

## Launch

Build, test and run the service directly with the repository's Rust toolchain:

```sh
cargo build --locked -p filesystem-service
cargo test --locked -p filesystem-service -p filesystem-protocol

cargo run --locked -p filesystem-service
```

The executable accepts no arguments and starts with an empty selection. Run the
web app separately with `pnpm dev`; its file or folder control requests the native
dialog.

The service and application component compile the shared `ADDRESS` from
[`config/native_service.rs`](../../../config/native_service.rs): `127.0.0.1:3211`.
The service binds that address; an occupied port is a startup error. There is no
service discovery, alternative port or runtime address override. After changing
the configuration, rebuild both the engine and native service:

```sh
cargo build --locked -p filesystem-service
pnpm engine:build
```

Startup prints a JSON readiness record containing the WebSocket `endpoint`.
The service runs until explicitly stopped.

Open `/`, `/ark` or `/compare` in the separately running web app. All presentations
use the same service. Their Rust components use the configured service address; React
presents their results and connection failures. Refresh and route switching create
new component instances that query the retained native owner. Restarting the service
starts an empty owner at the same address. The user must start the local service before
using native selection.

Ordinary native clients accept explicit endpoint arguments independently of this
application configuration.

## Bounds and lifecycle

Native reads are bounded to 64 KiB per request with checked range arithmetic and
bounded allocation. Empty reads perform no native I/O. See the
[parser contract](../../../docs/architecture/rust-analysis-core.md#reads-and-memory)
for analyzer memory behavior.

Messages are capped at 1 KiB for requests and 96 KiB for responses, including
named-field overhead. The shared codec checks message size before decoding owned
fields, rejects trailing bytes and
configures the decoder's nesting limit to 32. It validates resources, offsets,
lengths and response variants. Directory responses contain at most 512 distinct
entry IDs and 64 KiB of combined name bytes. Root/cursor/file display names each
have a 4 KiB limit; entry references contain one validated resource and entry ID.
Each directory response carries one listing. A codec test checks that maximum
listing and selection metadata fit the existing 96 KiB response limit. Read
payloads and error messages have their own limits. Decoding returns owned values; the frame limit is not a strict bound
on decoder allocations.

The service admits at most eight connection tasks. Handshakes have a five-second
deadline. Connections may wait before their first request and between user actions
without expiring selection. Reply delivery and protocol flushes retain their
five-second transport deadlines. Client connection bounds and provider/library
timers remain unchanged. Selection/filesystem exchanges, native operations and
picker waits have no application deadline. The operation and its subsequent
current-state observation can both remain pending while awaiting a result.

### Waiting for native access before scheduling blocking work

[`Handler::dispatch()`](src/server/handler.rs) applies this ordering to state/metadata
queries, reads and child opens:

1. Await `selection.lock_owned()` asynchronously. The mutex protects the service's
   selection owner and retained handles; it is not an operating-system file lock.
   A request waiting here occupies no blocking worker.
2. Move the acquired guard into `spawn_blocking`. The job calls `operate()` while
   retaining exclusive access to the native owner.
3. Release the guard when that job finishes, allowing another request or shutdown
   to access the owner.

This ordering matters when native I/O stalls: additional requests wait
asynchronously rather than occupying blocking workers just to wait for the mutex.
If the service drops a dispatch future during that wait, no blocking job has been
submitted. After submission, dropping the caller does not cancel the job; the job
retains its guard until completion. Neither step uses an application deadline.

The Rust test `abandoned_native_admission_does_not_occupy_blocking_workers` in
[`handler.rs`](src/server/handler.rs) holds native access, explicitly drops a waiting
request and verifies that another blocking job can still run with a one-worker
pool. File/folder dialog requests use `choose()`; see the
[selection acquisition and lock handoff](SELECTION_ACQUISITION.md) for the sequence
diagrams, guard ownership and cleanup ordering.

### Dialogs and shutdown

The synchronous `run()` entry point owns the service's Tokio runtime. Call it
from the OS main thread without an entered runtime or a GUI framework owning
native event processing. Both the developer executable and installed launcher
use this entry point.

On macOS, `rfd::macos::run_with_native_events` processes AppKit events on main
while the service and its Tokio runtime run on rfd's worker. The serial dispatcher
uses ordinary synchronous `FileDialog` calls; rfd forwards native presentation
to main. Native events continue between requests and after a picker returns,
including deferred dismissal with normal animation. The workspace pins the
fork's `feat/macos-standalone-event-loop` revision; the application needs no direct
AppKit dependency or GUI framework. Other platforms run the service and serial
dispatcher on the calling thread.

A permit prevents overlapping panels, including when a caller stops waiting.
Queued abandoned requests do not open a dialog. Shutdown or service-side
abandonment invalidates pending requests, and late dialog results are discarded.
The service does not concurrently monitor the socket for disconnect while
dispatching a request. View disposal or disconnect
alone does not prove that the service abandoned or rolled back acquisition.
Synchronous native work may continue after the caller stops waiting. The provider
cannot dismiss an already-visible OS panel programmatically. Native opens and
reads run on blocking threads so they do not block the async networking runtime.

An already-running OS read cannot be forcibly interrupted. Shutdown stops
connection tasks, waits for native access, then marks the selection stopped and
drops the owner. Shutdown has no application deadline or forced termination timer.
The dispatcher waits for the user to dismiss any visible dialog and exits after
its request channel closes. Tokio teardown then completes before the application
closure returns to rfd and requests native-loop shutdown. Returning does not
certify that every dismissal animation has completed; the helper spans the
service lifetime, not an individual picker call. Signal registration precedes
readiness publication, and startup/publication failures also clean up. On POSIX,
Ctrl-C sends SIGINT through the service's registered
graceful-shutdown path. Forced termination in tests is disposal fallback,
not proof of graceful cleanup; Windows signal behavior requires separate qualification.

## Scope of the evidence

Native tests cover short reads, EOF, native errors, stale resource identifier rejection,
transactional acquisition and listing, dialog cancellation, persistent selection,
and shutdown ordering. Socket tests cover multiple clients with
absent or arbitrary Origin headers and rejection of malformed or oversized
messages. Codec tests cover bounded binary payloads, malformed messages, directory
limits and request/response matching. The JavaScript suites
retain focused component, runtime and host-binding checks without starting this
service. They do not establish a complete native-service-to-browser round trip.
Qualifying that path requires running the service and application through the real
provider and native dialogs; native Rust tests alone do not establish browser support.

A retained handle identifies the opened object and survives pathname replacement;
it does not freeze file contents. Length is captured at open time. Concurrent
mutation can still change bytes or cause EOF. Bounded reads do not establish
snapshot consistency, complete symlink/xattr/ACL fidelity, application
reconstruction, signing or executable-loading eligibility. Cross-platform
service deployment and browser support require their own qualification.
