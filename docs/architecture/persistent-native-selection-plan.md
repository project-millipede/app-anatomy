# Persistent native selection with presentation-only frontends

## 1. Ownership and behavior

Replace the earlier UI-session cleanup plan with one persistent native selection owner.

- The service runs until explicitly stopped. Remove selection/file leases.
- Connecting, disconnecting, refreshing or switching frontend implementations does not change native selection.
- Acquire a replacement successfully before releasing the previous resource. Cancelled dialogs and failed acquisition preserve the existing selection.
- Analysis success, failure and cancellation preserve the selected resource.
- Explicit clear releases the selection but leaves the service available for another selection. Shutdown releases resources and stops the service.
- Base UI and Ark are alternative views of the same native selection. Presentation state, such as report tabs, can remain independent.

Implementation will first produce an isolated, complete review diff against the current checkout. Repository naming and folder reorganization remain separate.

## 2. Rust implementation and API boundaries

**Reusable native ownership**

Add the selection owner to the existing `apple-code-native` crate. It retains the current file, directory and their display information, and provides ordinary Rust operations for acquisition, replacement, current state, reading and clear.

It contains no dialogs, authorization tokens, networking, Tokio, WIT or browser behavior. Direct `NativeFileSource` use remains available. No additional crate or controller framework is introduced.

**Native service**

The service wraps that owner with authorization and opaque resource identifiers. Keep the native dialog in the executable.

- Retain the existing lock around resource access and replacement.
- A read already admitted finishes against its original file. Successful replacement invalidates its old identifier; subsequent stale requests fail rather than reading the replacement.
- Explicit clear invalidates pending selection attempts so a late dialog result cannot restore a cleared selection. Clear does not revoke the authorization needed to select again.
- Remove lease timers and readiness fields describing expiry. Retain connection limits and network-operation deadlines.
- Keep the existing limitation that invalidating a dialog request does not dismiss an already-visible OS panel.

**Persistent state and operation results**

Add an authorized current-selection operation through the ordinary Rust API, shared protocol and component interface. Return native-owned names, resource identities, current directory and listing information. Distinguish an empty selection from an unavailable or unknown state.

Selection operations return their result alongside the resulting selection state. Expected Rust failures cross WIT as structured outcomes, allowing host execution failures to remain separate.

Compose folder selection/navigation and its required listing in ordinary Rust. React sends the intent and receives the completed outcome.

**Inspection and accounting**

Remove automatic file release from inspection. Return the analysis result and per-analysis read statistics independently of selected-file lifetime.

The current service imposes lifetime limits of 1 MiB and 65,536 reads per retained file. Those cannot remain unchanged for indefinite selection:

- Keep service-side per-request size, framing and allocation bounds.
- Keep total-byte and call limits per inspection in the existing Rust input reader.
- Collect per-inspection request/returned-byte statistics in Rust.
- Describe these counters accurately; an unanswered request cannot establish how much native work completed.

Use this simpler approach rather than adding another begin/end read-session protocol.

Update affected examples and probes to retain selection after reads and explicitly clear only when their scenario requires it.

## 3. Frontend, bindings and reconnection

**One native owner**

Change the launcher to start one service for `/`, `/ark` or `/compare`. Publish one frontend-neutral connection grant. Starting with an explicit file seeds the native selection; selecting a route only chooses its presentation.

Cache validated connection metadata—endpoint and authorization—in browser `sessionStorage` for same-tab refresh/navigation. Do not cache selected files, native lifecycle state or reports as authoritative state. Remove the grant from the URL as today.

Each frontend queries native selection when connecting, becoming active and before a native operation. No React Context or shared JavaScript selection store is introduced. Immediate cross-tab synchronization is outside this change.

**Remove frontend lifecycle decisions**

Remove automatic native clear/release/revocation triggered by:

- React unmount or navigation.
- Switching frontend or adopting another connection grant.
- Late asynchronous results after a view disappears.
- Ordinary selection/analysis failures.
- Browser engine loading or component execution failures.

Late results may be ignored for presentation. Environment adapters may dispose their own sockets and component resources; disposal must not clear native selection.

Remove error-class-based restoration and recovery decisions. React displays the state returned by Rust rather than clearing or reconstructing it itself.

**Preserve authoritative outcomes**

Pass Rust’s structured inspection result through the browser adapter instead of collapsing it into exceptions. Final cancellation comes from Rust; `AbortSignal.aborted` represents only a cancellation request.

Retain operation admission protection and environment-required bindings. Introduce no exception-based trap detection or replacement observer mechanism.

Expose explicit clear as a Rust operation with a small control in both interfaces. A cleared selection remains connected and can be replaced later.

**Contracts and documentation**

Update the owned filesystem protocol and component contracts together, including all generated bindings and consumers. Use protocol version 2 and application WIT package version `0.3.0`; leave upstream Polymorph/WASI definitions unchanged.

Update repository instructions and existing architecture documentation that currently require independent native selections, cleanup on navigation, leases or release after every analysis. Document the current ownership model without repeated migration history.

## 4. Verification and delivery

Extend existing focused tests to demonstrate:

- Failed or cancelled acquisition preserves the previous selection.
- Successful replacement invalidates old identifiers without mixing file contents.
- Clear preserves authorization and rejects late picker results.
- Repeated analysis retains selection and does not exhaust a file-lifetime quota.
- Analysis failure and cancellation preserve selection.
- Reconnection returns the same native selection.
- Two component instances can observe the same owner; disposing either does not clear it.
- Host execution failures do not issue native release/revocation.
- Explicit shutdown releases native resources.

Validate the launcher’s single-service behavior and same-tab refresh/Ark–Base navigation. Check that both interfaces render Rust outcomes without recovery guesses.

Run workspace Rust tests/examples, engine and service builds, retained component/transport tests, TypeScript, production build and formatting. Inspect generated WIT and dependency trees to confirm that reusable native APIs remain free of networking and component-runtime dependencies.

Deliver the complete review diff, change inventory and validation results. Report actual OS-dialog/platform coverage explicitly. Do not apply or commit the proposal during preparation.
