# System overview

**Status: implemented bounded Mach-O header analysis with native filesystem input.**
The [Rust core](rust-analysis-core.md) owns parsing contracts, the
[filesystem communication flow](rust-runtime-independence/filesystem-communication-flow.md)
owns networking and resource semantics, and the
[UI comparison](base-ui-and-ark-panda-comparison.md) owns presentation tradeoffs.

The ordinary Rust analyzer accepts resident bytes or a bounded `ByteSource` and
uses `object` 0.40.0 parsers to produce owned report records with its Mach-O types.
The [parser contract](rust-analysis-core.md#parsing-dependencies) defines the
upstream entrypoints, acceptance, bounded reads and diagnostics. Rust preserves raw
values and supplies the library's canonical names where available. Ranges use
absolute offsets. Native reports retain upstream version values; the component
exports their `Display` strings for React to display directly.
The [core API contract](rust-analysis-core.md#native-use)
defines native dependency coupling and legacy-platform evidence.

```text
Application owner → one component runtime → jco → Rust component
  └─ one presentation model → Base UI / Ark UI / both

Component: Rust analyzer → Rust filesystem client → Polymorph WIT
  → jco host binding → published Polymorph browser provider
  → WebSocket → Native Workbench Service → one persistent native selection

Native Rust application → NativeSelection → NativeFileSource → same analyzer
```

The browser application uses the component contract `apple-code:analysis@0.5.0`.
Its selected operations compose ordinary Rust APIs; internal helpers are not
additional exports. Report and inspection interfaces supply shared types, while
native-session operations perform selection, navigation and inspection. Generated
WIT types do not become the ordinary Rust API. Mach-O values cross this boundary
as numeric identifiers with optional canonical names; Rust's `object` types remain
behind that component boundary.

The analyzer chooses the byte ranges to read. The Rust filesystem client owns
messages, response validation and resource semantics. The native library owns
acquired files/directories and transactional replacement. The
[Native Workbench Service](../../crates/services/filesystem/README.md) owns
opaque resource identifiers, request coordination and native dialogs.
The browser package supplies component preparation and environment bindings,
including Polymorph value conversion. The component and service share the Rust
address configuration in [`config/native_service.rs`](../../config/native_service.rs).
The component creates native sessions without an endpoint argument from React.
Requested ranges still enter Wasm memory; a resource identifier is not shared
memory or an exposed OS descriptor.

jco generates one bridge served with its Wasm assets under `/engine/`. Browser-only
code is loaded on the client. JSPI suspends configured component calls while host
operations are pending; `--instantiation async` controls initialization only.
Offsets and lengths remain `u64`/JavaScript `BigInt`. JSPI does not preempt synchronous
Rust computation or make arbitrary traps recoverable.

The browser supplies the observed resource identifier when requesting inspection.
The [parser contract](rust-analysis-core.md#reads-and-memory) describes traversal,
cache retention and allocation diagnostics. Structured errors retain parser diagnostics
and source-read operations and offsets. Native inspection returns the analysis report
or original failure. Inspection does not change native ownership. The UI shows “Analysis in progress…” while the invocation is
pending, then displays its success or error. It receives no preparation/parsing
phase notifications.

## Application ownership

`features/workspace/WorkbenchShell.tsx` is a client component mounted by
`app/page.tsx`. It calls `useNativeSession` to own one runtime created by
`createNativeRuntime()` and passes the `getNativeSession` accessor to
`useWorkbenchModel`. The model obtains the generated
WIT `Session` and calls `querySelection`, `chooseFile`, `chooseFolder`, `openFile`,
`openDirectory` and `inspect` directly.

The runtime’s `getSession()` lazily initializes and caches one component/session.
`createNativeRuntime()` keeps that promise and host bindings in a private closure.
Concurrent accessors share initialization; a failed initialization can be retried.
The existing `AsyncSession` mapped type preserves the generated `Session` methods
and parameters while adding their JSPI promise results, which jco's generated
declarations omit. It adds no operation implementation.

The model's synchronous `beginOperation` guard admits one UI operation before
awaiting the session, including when either comparison pane starts it. Direct
consumers of the generated session use jco's generated execution semantics.
The runtime manages initialization and host lifetime; jco controls entry into
component exports.

The owner retains selection data, pending state, the latest complete Rust outcome,
a separate host error, the current report and its architecture tab. The Server Page awaits `searchParams` and normalizes `view`
to `base`, `ark` or `compare`; missing, unknown and repeated values select Base.
It passes that value to the same unkeyed shell, which renders navigation and the
chosen presentation with explicit model props. `/`, `/?view=ark` and
`/?view=compare` are views of one page. The root layout supplies document structure
and routed children; `/explorer` and unknown routes do not mount the shell. The shell falls within
the normal page error and loading boundaries. No application React Context,
global singleton or runtime store is required.

Reading `searchParams` makes the page render at request time. View links use normal
Next.js client navigation: the page supplies an updated `view` prop while the
shell's component identity and local state are retained. This involves Next's
navigation response, without another native-filesystem request. Browser Back and
Forward use the same view URLs. A view value must not become the shell's React key.

Switching presentations therefore neither recreates the runtime nor repeats the
initial selection query. In `/?view=compare`, both panes display the
same outcome and report; either pane invokes the same actions. The choice of one
runtime is application composition, not a requirement of the reusable libraries.

Each result is associated with the Rust resource identifier used for inspection.
The model discards it when selection is observed as different, empty or unavailable,
or when a new analysis starts. A confirmed unchanged selection preserves it,
including after native-dialog cancellation. The current result remains only in
application memory, without report history or disk persistence. Selection does not
automatically start analysis, and external selection
changes become visible through the existing queries rather than push updates.

A full page refresh creates a new owner using the same Rust-configured address
and queries current native state. Focus changes do not trigger a query. A failed
query remains unavailable rather than becoming an empty selection.

The hook's `operationPending` describes the application's pending invocation.
`selectionState` is the last native state observed, with unavailable state distinct
from empty selection. `selectedFile` comes from that observation; it cannot make a
stale identifier valid. Rust and the service validate operations independently.

The generated selection and inspection outcomes expose ordered `steps`, each
carrying `kind` and `result`. The hook retains the complete returned outcome;
`OutcomeErrors` selects failed results in step order and passes their Rust-provided
messages to `ErrorMessage`, which renders the supplied text. React neither
reconstructs Rust messages nor guesses result fields. Selection data comes from a
successful selection payload;
a failed query leaves that data unavailable. Each admitted invocation clears the
previous outcome and host error. Unexpected component-loading or host-invocation
rejections remain separate from declared Rust results.

Base UI retains CSS Module controls. Ark uses scoped Panda tokens and button/tab
recipes with CSS Modules for layout. The common reset is in the base CSS layer;
Panda adds no reset or default theme. Both views belong to the same Next.js build.

The Application Explorer preview has a dedicated `/explorer` route.
Its server layout supplies the Ark theme and navigation; its server page supplies
metadata and renders the existing client preview. It mounts no `WorkbenchShell`,
workbench model or native runtime. Its four illustrative connections use the
local [Archer package](../../packages/archer/README.md), with a private store for
each drawing surface. That store contains rendering edges and DOM refs.
`ExplorerLayout` owns one Ark Tree View instance for the authored preview
inventory. Its selection directly supplies the center name and path; no second
React selection or expansion state is stored. `ExplorerFileTree` renders that
instance. Nested connector gutters derive T/L endings from direct sibling
position. Selection and keyboard focus decorate only the compact
icon-and-name surface; disclosure controls and connectors occupy separate space.
Evidence widgets remain placeholders, and native
inspection remains on the workbench page. No bundle graph or dependency resolution
is added.

Navigating from the workbench to `/explorer` ends the workbench owner and its
in-memory report. Returning creates a new owner that queries retained native
selection. Switching only the workbench's `view` query parameter keeps the existing
owner and report as described above.

### Runtime lifecycle

Ending the application owner discards its presentation state and calls
the runtime’s `dispose()`. Disposal permanently marks that owner as disposed,
clears its cached session reference and closes its local host WebSocket bindings.
Later `getSession()` calls reject. An accessor waiting for initialization also
checks disposal before returning a session; initialization that finishes after
disposal cannot create a session through this owner.

Disposal does not revoke a generated `Session` already returned to a caller and
does not explicitly drop its WIT resource, including during a pending invocation.
Such a caller can still invoke generated methods; their behavior follows jco and
the disposed host bindings, without an owner-level rejection around every call.
Closing host I/O can resolve pending work with a transport failure, but disposal
does not guarantee cancellation of every pending invocation or recovery from
arbitrary component traps.

Local disposal does not release native selection or roll back an acquisition
already admitted by the service. Native work may finish after the caller stops
waiting: the service does not concurrently monitor the socket for disconnect
while dispatching a request. An already-visible OS dialog cannot be dismissed
through the current provider. Native-dialog Cancel preserves selection, and service
shutdown and abandoned-request guards still discard late picker results. Native ownership ends
only at successful replacement or native owner/service shutdown. No frontend or
remote deselection operation exists. Selection observations do not establish
immutable file contents.

## Scope and qualification

Native selection, bounded reads and limited directory navigation are implemented.
Complete application traversal, metadata fidelity and source consistency still
require the [filesystem acceptance checks](../filesystem/requirements.md).

Next stages: signatures/certificates, bundle and resource graphs, dependency resolution, variant comparisons, then native verification and controlled rebuild execution. Their directories and APIs will be introduced when implemented, rather than adding nonfunctional exports now.

Before that full native executor, the proposed [early LIEF rewriting experiment](../libraries/lief-native-macho-rewriting-experiment.md) will evaluate dependency/rpath changes on controlled thin and universal fixtures, with separate signing and independent validation. It can proceed alongside evaluation of deeper portable analysis. For that initial rewriting experiment, LIEF stays in a native development harness; this plan adds no dependency to the core, component or browser application. The separate [LIEF integration study](../libraries/lief-selective-builds-and-wasm.md) evaluates possible Wasm delivery without changing this experiment’s native scope.

Future transformation work follows the [shared portability requirements](../portability/requirements.md).

Signature-command records retain their command and payload byte ranges. Neither command presence nor a successfully bounded range establishes cryptographic integrity, certificate trust or runtime eligibility. The report explicitly identifies its scope as header analysis.

Rust tests cover parsing, protocol size limits and structured diagnostics; component and browser-binding tests cover the JSPI requirement, shared session initialization and message/error conversion. The parsing checks establish header behavior only. No claim is made that all Mach-O formats, valid application structures, OS trust policies or signature formats are supported.
