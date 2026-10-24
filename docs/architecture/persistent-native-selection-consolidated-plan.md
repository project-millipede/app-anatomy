# Persistent native selection: consolidated implementation plan

Status: proposed restart plan, reviewed against the application checkout on
September 30, 2026; request timing, local access and Rust-owned address
configuration revised October 1, 2026.
This document does not apply an implementation.

This is the implementation specification for a fresh attempt. It combines the
[original plan](persistent-native-selection-plan.md), the supplied plan titled
“Complete the persistent-selection proposal by removing the previous lifecycle,”
and the subsequent decisions about frontend deselection, presentation names and
event-driven requests. The original plan remains unchanged as a record; its Clear
requirements, application request deadlines and browser-stored connection
settings do not apply to this attempt.

## 1. Assessment of the two plans

The second plan is a correction against an existing candidate, not a complete
replacement for the original plan. Its useful contribution is a concrete inventory
of obsolete APIs and state to delete. Persistent selection is not complete while
the old remote-release workflow remains callable alongside it.

| Area                    | Relationship between the plans                                                              | Consolidated treatment                                           |
| ----------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Native ownership        | Both require retention; the first defines acquisition and replacement.                      | Define ownership once in section 3.                              |
| Release protocol        | The first describes changed behavior; the second names leftover APIs, receipts and retries. | Use the complete retirement inventory in section 4.              |
| Explicit Clear          | Both require it in APIs, UI and tests.                                                      | Superseded: no frontend or remote deselection operation.         |
| Implementation baseline | The second requires continuing a particular temporary candidate.                            | Start from a fresh snapshot of the application checkout.         |
| State and accounting    | Both discuss outcomes and retained selection.                                               | Keep completed outcomes and native selection ownership explicit. |
| Presentation names      | Neither plan defines the agreed names or their limits.                                      | Specify them together in section 5.                              |
| Verification            | Both repeat broad test/build requirements; the second adds API-removal checks.              | One acceptance matrix and one fresh validation pass.             |

The original plan supplies requirements that the second assumes: a reusable native
owner, acquisition before replacement, admitted-read behavior, removal of lifetime
quotas and leases, one launcher service, reconnecting to that service and
Rust-composed selection outcomes. Those requirements must not disappear when the
cleanup inventory is adopted.

The second plan's Clear clauses were consistent with the first plan at that time.
They contradict the subsequently agreed contract. Keeping its Clear success path,
uncertain-Clear recovery, UI control or tests would implement the wrong operation.

The current checkout still contains the earlier release-based implementation. For
example, the client releases resources before acquisition, the hook closes native
sessions on several UI/error paths, and the launcher starts two services for
`/compare`. It does not currently expose the proposed Clear path. This restart must
remove the existing release lifecycle and must not introduce Clear as its replacement.

## 2. Baseline, scope and execution requirements

Capture the current application checkout, including relevant untracked files and
all existing uncommitted changes, immediately before implementation. Record its
source inventory and hashes. Prepare a new isolated candidate from that capture.
Do not start from Git HEAD, apply an older proposal, or copy its implementation as
the new baseline. Earlier candidates may supply review evidence and known failure
cases; their validation does not validate the new work.

Use the requested `ultra` reasoning setting for implementation and review. Verify
the setting for those turns and record it separately from the setting used to
author or save this plan. A setting is not evidence that the resulting code meets
the contract; the acceptance checks below remain required.

Do not edit the application checkout during implementation preparation. Do not
commit, publish or integrate the candidate without a subsequent instruction.

Keep existing crates and adapter locations. Add no dependency, runtime, lifecycle
framework, replacement observer, lease controller or new begin/end read protocol.
Repository naming, folder reorganization, browser filesystem input, signing,
metadata expansion and cross-tab push synchronization
remain outside this change.

## 3. Ownership and observable behavior

### Responsibilities

| Layer                              | Owns                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `binary-inspection`                | Binary interpretation, requested ranges and inspection limits.                              |
| `filesystem-native`                | Acquired native files/directories, names, listing and replacement.                          |
| `workbench-operations`             | Remote messages, response validation, selection-state projection and operation composition. |
| Component and environment adapters | Selected Rust API projections, networking bindings and local runtime resources.             |
| Native service executable          | Resource identifiers, request coordination, OS dialog and process shutdown.                 |
| React                              | User intent, rendering, local pending state and report tabs.                                |

Keep the established browser path: React calls the Rust component through jco;
ordinary Rust client code uses Polymorph WIT networking operations; the published
browser provider and required host bindings carry shared Rust MessagePack messages
to the native service. No JavaScript filesystem client is introduced.

Ordinary native applications can compose the native owner, `NativeFileSource` and
`inspect_source()` without a service, WebSocket, WIT, JavaScript or Wasm runtime.
OS-specific filesystem implementations remain in the native library; dialogs and
`rfd` remain in the service executable. A file-resource identifier is neither an OS
descriptor nor shared memory; requested bytes still enter browser Wasm memory.

### Native selection

One service owns one persistent selection. Base UI and Ark are alternative views
of that owner. Their component instances, pending UI operations, errors and report
tabs remain independent. Selecting in one view changes the native selection that
the other observes on its next query; it does not synchronize their reports.

- Acquire and validate the replacement before releasing the previous resources.
  A cancelled native dialog or failed acquisition preserves the existing state.
- Selecting an external file installs the new file and removes the prior directory
  context. Selecting or navigating into a directory installs its bounded listing
  and removes the prior selected file. Opening a listed file replaces the file
  while retaining its parent. Each replacement follows successful acquisition.
- Inspection success and failure do not release the selection.
  Refresh, navigation, disconnect and frontend disposal do not change ownership.
- Native cleanup occurs during successful replacement, owner destruction or
  service shutdown. There is no frontend deselection action or remote Clear API.
  Ordinary native cleanup helpers and Rust resource destruction remain valid.
- Retain the lock coordinating native access and replacement. An admitted read
  finishes against its original handle. The service rejects replaced identifiers
  with an unknown-resource failure, without retaining release receipts.
  Stale requests must never silently read the replacement or replay an inspection
  against another file.

The retained selection is not an immutable snapshot of file contents. Preserve
the native reader's existing live-file, short-read and EOF behavior. This work
does not add filesystem snapshots, stronger path confinement or metadata fidelity.

### Authoritative outcomes and uncertainty

Provide a current-selection operation containing native-owned display
names, current identifiers and the captured directory listing. Represent confirmed
empty selection separately from a failed or unavailable state query.

Compose selection/navigation and the needed state retrieval in ordinary Rust.
Return the operation result separately from the state observed afterward. A later
query is an observation, not a guarantee that another caller could not replace the
selection in between. Rust and the service must still validate every identifier.

If acquisition succeeds but its response is lost, the next query may show the new
selection. Do not replay acquisition, restore the former selection or revoke the
owner to resolve uncertainty. Preserve the original operation failure even if the
follow-up state query also fails. An unknown local projection is not an empty
native owner.

Expected Rust errors remain structured outcomes through WIT. Host execution
failures remain distinct. Preserve typed causes, provider codes and core source
diagnostics; do not replace these with frontend error-class recovery rules.

### Service and dialog lifetime

The service runs until explicitly stopped. Retain one OS-main-thread dialog path,
the single-panel permit and existing synchronization around native access. Do not
move dialog orchestration into a reusable filesystem crate or React.

Bind the service to loopback. Any local client may query, change and read the shared
selection. Require no secret, grant, Origin check or browser detection. Resource
identifiers distinguish the current file and directory from replaced resources;
they are not access credentials. Let WebSocket backends parse endpoint URLs without
custom client host or origin admission rules.

Remove selection/file leases and expiry fields. Keep existing connection limits
and framing/allocation bounds. Retain connection and handshake deadlines,
reply/flush deadlines and provider/library timers. Remove application deadlines
around selection/filesystem exchanges, native request dispatch and picker waits.
A connected client may
wait between user actions without expiring selection. A pending operation or its
subsequent current-state query may continue waiting for a result; an application
elapsed-time check must not manufacture a failure, cancellation or empty selection.

Start the native executable directly and retain its readiness output after binding
the configured address. Shutdown is event-driven, with no application shutdown
deadline or automatic forced termination timer. Keep bounded waits and disposal
fallbacks in tests separate from production lifecycle policy. Use the existing
synchronization, shutdown and request-abandonment guards, and runtime mechanisms; introduce no
coordinator or observer.

Keep signal registration before readiness publication and cleanup after startup,
publication or serving failures. Preserve cleanup ordering and error precedence:
stop connection tasks, wait for native access, then invalidate pending acquisitions and drop the
owner. Native blocking I/O cannot be forcibly interrupted.

For controlled graceful shutdown on POSIX, use the service's registered SIGINT
path. Forced process termination does not prove graceful cleanup. Do not infer
Windows signal behavior from POSIX tests.

If shutdown or service-side abandonment invalidates a pending dialog request,
discard its eventual result. The service does not concurrently monitor a socket
for disconnect while dispatching its request. View disposal or disconnect alone
is not proof that the service abandoned or rolled back an acquisition. Synchronous
native work may continue after its caller stops waiting. The existing provider
cannot programmatically dismiss an already-visible OS panel; do not promise
otherwise.

### Inspection outcomes, pending state and local disposal

Keep limits per inspection using the existing Rust input reader and parser/cache
limits. Remove the service's retained-file lifetime quotas of 1 MiB requested data
and 65,536 read calls. Keep its 64 KiB per-request bound, checked range arithmetic
and bounded allocations. Repeated valid analyses must not exhaust owner lifetime.

Return the inspection report or original failure as a completed step. Selection
and inspection use `Outcome<Step>` to retain completed steps in execution order.

Use ordinary Rust `Session::inspect` to return the analysis outcome.
Remove analysis progress callbacks and phases, the `native-events` WIT interface,
and application cancellation controls, controllers, signals and observer checks.
The UI shows “Analysis in progress…” until invocation completes, then displays
success or error. It cannot distinguish preparation from parsing; add no
replacement polling or events. Rust determines the final operation outcome.
Native-dialog Cancel, provider/core cancellation errors, service shutdown and
late-acquisition guards remain supported.

Permanently disposing a view closes its local host sockets and prevents further
use of that runtime. Native work already admitted by the service may complete;
disposal does not roll it back or release the native selection. Retain transport
deadlines and test safeguards. Do not introduce exception-class-based trap detection
or claim arbitrary component-trap recovery.

## 4. Complete API and state retirement

Use this inventory across implementation, exports, generators, tests and active
documentation. Remove a retired path completely; do not preserve it as a second
supported ownership model or replace it with another cleanup command.

| Boundary                   | Retire                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared filesystem protocol | `Release`, `ReleaseDirectory`, `CloseSelection`, their response/receipt variants, and the standalone `Entries` request/response. Do not introduce `ClearSelection`.                                                                                                                                    |
| Rust client                | Fixed-resource `Session::from_file`, public release/close workflow methods, eager pre-acquisition release, cleanup-on-cancellation, acquisition-failure revocation, receipts, pending-release retries, permanent local closure state, `Cancellation`, `Observer`, `Phase` and `inspect_with_progress`. |
| Service                    | Fixed-resource-only remote mode, release receipts and receipt-only counters, receipt-based recognition of stale IDs, lease fields/timers and remote authority closure. Preserve native shutdown.                                                                                                       |
| Component/WIT              | `create-file-session`, `session.release-file`, `session.entries`, `cancel-file`, `close-selection`, release outcome fields, releasing/released phases and the `native-events` interface. Do not add `session.clear`.                                                                                   |
| Browser adapter            | Fixed-file grant branching, `NativeFileSettings`, standalone `inspectNativeFile`, `NativeFile.close`, independent remote-cleanup control instances, cleanup/restoration exception wrappers, per-operation abort signals and progress callbacks/options.                                                |
| Frontend                   | Native cleanup on unmount, grant replacement, late results or failure; release-confirmation UI states; consuming selection before analysis; manual navigation-plus-listing composition; analysis Cancel controls, controllers, cancellation state and progress phases. No Clear control or handler.    |

The remote client retains a required selection connection and a projection of
native state. Keep composed operations public; keep low-level workflow helpers
private when no ordinary Rust consumer requires them. Resolve child names/kinds
from the native-returned listing without another remote `Entries` call; the service
revalidates identifiers when they are used.

Keep a thin browser file reference using its selection runtime. Ordinary native
slice/source APIs and native handles are unaffected by removing fixed-resource
remote sessions. The service executable starts with an empty owner and rejects
all arguments; file and folder acquisition begins through its native dialogs.

Remove cleanup-specific `FailureContext`, context fields/conversions and diagnostics
whose only purpose disappears with the retired workflow. Preserve remaining error
categories and cause chains. Use small borrowed validation helpers instead of
cloning data into deleted response variants; introduce no validation framework.

Retain runtime invocation admission, local disposal and required Polymorph/jco host
bindings. Removing a cleanup callback must not weaken protection against reentry.
Do not remove WebSocket closure, retained transport/provider timers, native RAII
cleanup or input-reader short-read loops merely because a search finds “close,”
“release” or “retry.”

Use filesystem protocol v3 and application WIT `0.5.0`.
Application session construction has no endpoint argument. Selection requests
carry no connection credential. The native range-read probe retains explicit endpoint
and range arguments. Its ordinary API returns `Result<FileRead, Failure>`. The
executable prints the library result as JSON and exits with status 0 for success
or 1 for failure; malformed command-line arguments fail on stderr. Regenerate
through existing build commands; do not hand-edit generated bindings or upstream
Polymorph/WASI inputs. No legacy
schema compatibility path is required for this unpublished proposal.

## 5. Frontend presentation and Rust-owned address configuration

Start one service directly with `cargo run --locked -p filesystem-service`
and the web app separately with `pnpm dev`. The service accepts no arguments and
starts with one empty owner shared by `/`, `/ark` and `/compare`. Service and application component
compile `ADDRESS` from `config/native_service.rs`, initially `127.0.0.1:3211`.
The service binds exactly that address; an occupied port is a startup error.
Changing it requires rebuilding both service and engine. Introduce no discovery,
port fallback, environment override or address CLI.

React creates a native session without an endpoint argument and presents Rust
results. Keep application connection configuration out of URL fragments, browser
storage and React state. The application's file and folder controls request native
dialogs. Refresh creates a component that queries the same native owner. Service
restart creates an empty owner at the same address. Do not add a Node service
launcher or startup fixture mode.

Keep readiness JSON for ordinary native callers and probes. Optional native
probe APIs retain explicit endpoints; this application configuration
does not constrain ordinary reusable Rust APIs.

Query state when connecting, becoming active or reconnecting. Rust-composed
operations refresh/validate the context they need. Avoid adding duplicate preflight
work in React solely to repeat the Rust workflow. UI state cannot eliminate stale
identifier races or replace native resource validation.

Use these names in the shared hook/model and both presentations:

| Name                                         | Exact meaning                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `operationPending` / `setOperationPending`   | This view is awaiting an operation. It is not a native/global busy flag.                                                                  |
| `selectionSnapshot` / `setSelectionSnapshot` | The last native selection state observed by this view, with unavailable state represented separately. It is not a snapshot of file bytes. |
| `hasSelectedFile`                            | The observed known state includes a selected file; Rust must still validate its identifier when used.                                     |

Replace `busy`, `setBusy`, `nativeSelectionAvailable` and any corresponding
`available` state with those meanings. Use `hasSelectedFile` in place of the earlier
proposal's `nativeFileAvailable`; derive it from the snapshot rather than adding
another independently maintained boolean. Do not rename unrelated report-tab
selection variables, native domain terminology or the HTML `aria-busy` attribute.

The presentation can disable selection while an operation is pending, and disable
inspection without an observed selected file. These are UI conveniences, not native
policy. Keep the independent runtime admission guard and service-side checks. A
failed state query displays uncertainty; selection controls remain available for
another user-requested attempt. Do not infer service health from configuration.

On unmount, permanently dispose local component/socket bindings and stop publishing
stale React results. Do not issue native release, close, revoke or clear requests. Keep
Rust outcomes intact instead of restoring an earlier UI state based on JavaScript
exception classes. No React Context, shared runtime store or native-lifecycle
controller is introduced.

## 6. Implementation order and code quality

These are internal checkpoints in one isolated candidate, not separately applied
patches and not sequential reuse of the previous implementation diffs.

1. **Capture and inventory.** Record the actual source baseline, identify consumers
   of section 4's retired contract, and map existing tests to section 8's guarantees.
2. **Native owner and service.** Add reusable ownership in the existing native
   crate; implement transactional replacement, retained presentation data, current
   selection and persistent service behavior under section 3.
3. **Protocol and Rust client.** Define the final message set directly, retire the
   old lifecycle, compose selection outcomes, and implement independent inspection
   results. Keep direct native use independent of this network layer.
4. **Component and adapters.** Project the chosen ordinary APIs through WIT,
   regenerate bindings, and narrow browser/probe surfaces together. Preserve
   existing provider operations and local runtime responsibilities.
5. **Service startup and presentations.** Use direct Cargo invocation and the
   naming contract. Render Rust outcomes without adding a cleanup or recovery path.
6. **Complete the audit.** Migrate useful assertions, delete obsolete-only tests,
   align existing documentation and verify no retired public path remains. Run
   the fresh acceptance checks before producing the review patch.

Prefer explicit operations, cohesive functions, early returns and ordinary owned
state. Use inferred lifetimes where possible; do not add lifetime/generic parameters
to carry selection state unnecessarily. Preserve justified borrowing rather than
using unsafe code or gratuitous cloning to hide it. Keep comments about ownership,
JSPI typing, shutdown ordering and provider limitations; omit line-by-line narration
and patch history. No broad formatting or unrelated API cleanup belongs here.

## 7. Documentation ownership

Update existing descriptions instead of copying this plan throughout the docs:

- `AGENTS.md`: one native owner, presentation-only frontends and no remote cleanup.
  Its current independent-selection/navigation-cleanup clauses are superseded.
- System overview and UI comparison: actual selection/reconnect flow and independent
  presentation state around shared selection.
- Rust reuse contract: ordinary native composition and environment boundaries.
- Communication-flow document and service README: final protocol, local access,
  replacement, retained selection and shutdown behavior.
- Client/probe READMEs and affected examples: final callable APIs, result shapes
  and CLI exit behavior. Keep historical evidence explicitly scoped as historical.

Correct directly affected filesystem requirements, captions and source comments.
Preserve APFS, metadata, symlink, `rpath`, WASI and memory-boundary explanations.
Do not turn a blanket keyword removal into deletion of valid research or internal
cleanup documentation. This consolidated plan is the single restart checklist;
the original plan remains an unchanged record rather than a second instruction set.

## 8. Acceptance and validation

Reuse focused coverage at its owning layer. Tests that only exercise retired
receipts, remote closure, retry state or fixed-session mode can go. Preserve useful
assertions before deleting mixed-purpose tests; do not add an exhaustive new matrix
or another JavaScript range-read suite.

| Guarantee                                                                                                                               | Evidence owner                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Acquisition and listing complete before replacement; native acquisition failure or native-dialog cancellation preserves selection.      | Native-owner/service tests using existing seams.                     |
| An admitted read uses its original handle; replaced identifiers fail, and file/directory identifiers cannot substitute for each other.  | Service resource-identity/replacement tests.                         |
| Ordinary native ownership and analysis work without networking/WIT.                                                                     | Native library tests and a direct composition example.               |
| Lost replies and unavailable state stay distinct; a later snapshot may reflect another caller’s replacement without replay or rollback. | Rust client tests with controlled responses.                         |
| Repeated inspection returns reports while retaining native selection.                                                                   | Rust client/input tests; full application qualification separately.  |
| Pending-state presentation preserves Rust outcomes; permanent view disposal closes local sockets while retaining native selection.      | UI workflow checks, Rust owner tests and focused runtime tests.      |
| Two component instances share the owner; disposal/reconnection preserves it.                                                            | Rust shared-owner tests and separate full application qualification. |
| Owner shutdown rejects abandoned late picker results and waits for native access after stopping connections.                            | Service/picker tests; actual signal tests on qualified platforms.    |
| No retired lifecycle, analysis progress/cancellation or Clear API remains callable.                                                     | Consumer search plus compiled WIT/schema inspection.                 |
| Renamed flags describe local pending/observed-state facts.                                                                              | TypeScript checks, code review and both UI workflows.                |

Preserve parser parity, malformed-input, range/limit/EOF, structured-error/cause,
unrestricted local-client access, retained transport deadlines, socket reuse and runtime reentry
coverage. Verify pending selection/filesystem operations and current-state queries
are not failed by application deadlines. Keep test watchdogs without introducing
production request or shutdown timers. Verify zero-argument application session construction,
argument rejection and empty service startup, plain application URLs, fresh component
queries after refresh and startup failure on an occupied configured port. Keep
operation failure assertions separate from test cleanup.

Use Cargo for native service builds and Rust tests. Build the engine separately
with `pnpm engine:build`; run the surviving component/lifecycle and Polymorph
checks, TypeScript, web tests, production build and formatting. The JavaScript
suites do not launch the native service or establish a complete native-to-browser
round trip. Verify upstream WIT bytes, generated callable surfaces and
reusable dependency boundaries. Do not use an old executable or generated bridge
from another candidate as evidence.

In both UIs verify selection, repeated analysis, replacement, directory navigation,
refresh, Ark/Base switching and unavailable-service presentation. Check that no
Clear action or release-confirmation wording remains. Verify one configured service
on `/compare`, empty startup and retained native selection after refresh. A view may
observe another view's replacement on its next query; immediate push is not claimed.

Exercise native dialogs and controlled shutdown where available. Report untested
platforms, panel dismissal limitations and any unqualified behavior explicitly.
Successful tests do not establish arbitrary trap recovery, immutable file contents,
complete metadata fidelity or zero-copy access.

## 9. Delivery

Deliver one complete review diff against the newly captured checkout baseline,
including a change inventory, fresh validation results and limitations. A focused
delta against an older temporary candidate is not the restart deliverable.

Apply the patch only to an independent baseline copy for verification; prove that
it reproduces the candidate and that the original checkout's source files and
pre-existing changes remain unchanged. List any consciously deferred issue
explicitly rather than retaining a hidden compatibility or cleanup path.

Keep the previous proposals intact. Integration into application files remains a
separate user instruction after review.
