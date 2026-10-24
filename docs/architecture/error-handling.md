# Error handling and future integration

Status: current implementation and future evaluation, reviewed 2026-10-15.
Ordinary Rust APIs retain owned errors; executables use `anyhow` for orchestration.
Eros is **not an application dependency or an adopted migration**. The Eros
evaluation below refers to version **0.8.1**, not an unspecified latest release.

This document owns the error-library comparison and integration criteria.
The [error-boundary guide](error-boundaries.md) compares structured and message-only
WIT contracts, binding conversion and selective presentation with separate
sequence diagrams. Neither contract design is prescribed for every consumer.
The [Rust reuse contract](rust-runtime-independence/README.md) owns execution
boundaries and workflow semantics. The [filesystem communication flow](rust-runtime-independence/filesystem-communication-flow.md)
owns the transport and native-selection lifecycle.

## Current responsibilities

| Owner                           | What it supplies                                     | What callers retain                                                            |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Native filesystem operations    | Actual I/O errors from opening, listing and reading  | Native error type and OS code where available                                  |
| Binary inspection               | Upstream decoding errors and input failures          | Parsing cause, or acquisition cause and read information                       |
| Filesystem protocol             | Message validation and codec errors                  | `ProtocolError`, its classification and numeric evidence, and codec cause      |
| Filesystem client               | Remote request sequencing and inspection composition | `Failure`, `InspectionFailure` and ordered step results                        |
| Environment adapter             | Connection, send and receive operations              | Original Polymorph or native backend error with operation context              |
| Component and executable output | Portable WIT or JSON values                          | Rust-formatted messages and the fields declared by that output contract        |
| React                           | Presentation and unexpected host-exception handling  | Returned messages; it does not reconstruct Rust diagnostics or recovery policy |

The source owners are [client failures](../../crates/workbench/operations/src/failure.rs),
[protocol errors](../../crates/filesystem/protocol/src/error.rs),
[inspection errors](../../crates/binary/inspection/src/error.rs) and
[input errors](../../crates/binary/inspection/src/input/error.rs).

### Error type, operation context and outcome step

These answer different questions:

| Information             | Example                                | Purpose                                                    |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Concrete cause          | `std::io::Error` with an OS error code | Preserve what the backend reported                         |
| Transport operation     | `TransportOperation::Receive`          | Identify where the adapter failed                          |
| Completed workflow step | `StepKind::SelectFile`                 | Associate a result with the action requested by the caller |
| Diagnostic text         | A Rust-formatted explanation           | Present the failure to a person                            |

An operation label does not execute the operation. A step kind does not replace
the underlying error. Message wording is not a classification API.

The client currently keeps `FailureKind::{Transport, Provider}` and
`TransportOperation`. It has no `LocalFailureKind` or `local_condition()`
accessor. `Failure::local(operation, message)` remains for failures detected by
the adapter itself; an optional cause can be attached with `with_source`.

### Causes and boundary conversion

A backend or protocol failure retains its original Rust error through
`Failure::source()`. Remote I/O failures supply a message, so the client cannot
recover a native error object that never crossed the wire. Direct native callers
retain the original `std::io::Error`, including its kind and any OS error code.

For a remote read failure, the owned chain can be:

```text
InspectionFailure
  → InspectionError
  → InputError
  → SourceError::Provider
  → Failure
  → original backend or protocol error
```

The component's [conversion](../../crates/workbench/component/src/inspection_error.rs)
turns that chain into its declared WIT data. It formats messages in Rust.
`Failure` is not serialized directly.

The analyzer's cache adapter retains an acquisition error because
`object::ReadCacheOps` reports failure as `()`. Recovering that original cause is
an input-integration responsibility; changing the error library must preserve it.

### Steps and successful dialog dismissal

`Outcome<Step>` contains ordered `StepOutcome<Kind, Output, Error>` values.
These are result data, not an executor or error framework.

Selection requests produce the action step and then a query step. Both failures
remain available when both fail. A lost reply does not cause acquisition to be
replayed. The query can fail independently of the action.

Closing the native picker is a successful action that leaves the previous
selection intact. The following query reports that retained state, including an
empty state when nothing was selected. Provider-reported cancellation and
`SourceError::Cancelled` are separate conditions; ordinary picker dismissal must
not be turned into either failure.

## Current libraries: thiserror and anyhow

`thiserror` generates ordinary Rust error implementations while the project owns
the types and their semantics. `anyhow` supplies an owned report and contextual
propagation for executable orchestration. Neither determines request sequencing.
See the [thiserror documentation](https://docs.rs/thiserror/latest/thiserror/) and
[anyhow context documentation](https://docs.rs/anyhow/latest/anyhow/trait.Context.html).

The following examples are **pseudocode**. They illustrate ownership and proposed
API shapes; they are not additional production functions or a compilable patch.

```rust
// Current approach: preserve the protocol error inside the client failure.
let response = decode_response(&bytes).map_err(Failure::protocol)?;

// At an executable boundary, attach context for reporting.
let service = start_service()
    .context("Start native filesystem service")?;
```

The second call uses `anyhow::Context`; it is not a replacement for the typed
client API. The application calls each function explicitly and decides whether to
continue, reset a transport or return.

## Alternatives and their fit

| Approach                        | Benefit for this project                                                                      | Cost or limitation                                                                                         | Current decision                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `thiserror` plus `anyhow`       | Keeps ordinary typed library errors and executable reporting separate; already retains causes | Custom client carrier and conversion code remain ours to maintain                                          | Keep in the applied implementation                               |
| SNAFU                           | Derive-generated context selectors construct typed errors and attach sources                  | Introduces selector types and a different construction style; still requires decisions about public errors | Evaluated alternative, not adopted                               |
| Eros with an explicit error set | Composes existing error types without a new enum for every combination                        | Exposes Eros types if used in public signatures; error-set changes affect callers                          | Possible future evaluation where a caller needs typed handling   |
| Eros with its default error set | Concise propagation and accumulated context                                                   | Possible error types are not statically bounded; typed access uses runtime inspection                      | Evaluate only if simplification outweighs API and boundary costs |

SNAFU's derive macro can generate a name such as `BackendSnafu` from a
`Backend` error variant. That name is generated construction code, not a function
runner. Its ordinary `.context(selector)` usage processes the result of a call
made by application code. See [SNAFU's model](https://docs.rs/snafu/latest/snafu/)
and [context selectors](https://docs.rs/snafu/latest/snafu/derive.Snafu.html).
Using SNAFU would not require generated code to own our workflow.

## Eros: capabilities and limits

The reviewed 0.8.1 crate corresponds to upstream commit
[`5a853901`](https://github.com/mcmah309/eros/tree/5a853901d090f60f8ed0d58c34f7fbe130526600/rs/eros).
Its published source was inspected locally. These are version-specific findings;
a later adoption must recheck them.

### Explicit context preserves execution ownership

`eros::Context` attaches context to an existing result. The application still
calls and, when necessary, awaits the operation:

```rust
use eros::Context;

// Proposed example at a protocol boundary.
let response = decode_response(&bytes)
    .context("Decode filesystem response")?;

// For an asynchronous operation, the same order applies.
let value = operation().await.context("Complete requested operation")?;
```

The first statement keeps the concrete protocol error. The text adds information
for a person; it does not infer `TransportOperation`, a workflow step or a subtype.
`with_context(|| ...)` can construct diagnostic context lazily. That closure
constructs the context; it does not call the business operation.

Eros also offers optional `#[context]` and `#[eager_context]` procedural
attributes. They rewrite the function into a wrapper and an inner function,
then call or await that inner function. **That is not the integration direction
selected here.** Prefer explicit calls followed by context attachment. Do not
introduce an operation registry, generic runner or macro-controlled execution.

Eros is not entirely macro-free in that approach: its construction macros use
declarative macros and an internal procedural formatter. The excluded behavior
is function-body wrapping, not all code generation. See the reviewed
[context implementation](https://github.com/mcmah309/eros/blob/5a853901d090f60f8ed0d58c34f7fbe130526600/rs/eros/src/context.rs)
and [procedural macros](https://github.com/mcmah309/eros/blob/5a853901d090f60f8ed0d58c34f7fbe130526600/rs/eros-macros/src/lib.rs).

### Typed error sets are explicit

`eros::Result<T>` uses `ErrorUnion<AnyError>`. It retains a concrete underlying
error, but its signature does not enumerate the possible types. A tuple specifies
an explicit set:

```rust
use eros::Context;

type DecodeErrors = (ProtocolError,);

// Proposed narrower signature; not the current client API.
fn decode_reply(bytes: &[u8]) -> eros::Result<Response, DecodeErrors> {
    decode_response(bytes).context("Decode filesystem response")
}
```

The context string does not create that type information; `ProtocolError` and
the declared set do. A larger set can include other existing error types when the
function actually returns them. Avoid creating one public error type per function
merely to use this facility.

In the reviewed version, narrowing returns a `Result` separating a selected
error from the remaining errors. It does not require `Either::Left`/`Right`.
Narrowing to a concrete error discards its context metadata; narrowing to a
single-type tuple retains a smaller union. This optional handling API does not
replace the application's domain outcomes.
See the reviewed [union implementation](https://github.com/mcmah309/eros/blob/5a853901d090f60f8ed0d58c34f7fbe130526600/rs/eros/src/error_union.rs)
and [narrowing implementation](https://github.com/mcmah309/eros/blob/5a853901d090f60f8ed0d58c34f7fbe130526600/rs/eros/src/narrowing.rs).

### Context metadata is not automatic domain classification

Eros can retain text or error-valued context. Its optional `location` feature
records where a diagnostic was attached. A location is not evidence that a
particular filesystem action or transport operation was executing. Such meaning
must still be supplied deliberately.

The evaluated feature choice was:

```toml
# Evaluation configuration only; not an application dependency.
eros = { version = "=0.8.1", default-features = false, features = ["context"] }
```

Version 0.8.1 enables context and backtrace by default. Disabling defaults while
enabling context keeps contextual reporting without enabling its default
backtrace support. Disabling the context feature suppresses attached context;
conversion to `ErrorUnion` still occurs. Cargo feature unification and target
behavior must be checked during integration. See the reviewed
[feature definitions](https://github.com/mcmah309/eros/blob/5a853901d090f60f8ed0d58c34f7fbe130526600/rs/eros/Cargo.toml).

### Standard errors and output formatting need explicit treatment

In 0.8.1, `ErrorUnion` does not implement `std::error::Error`. Eros provides
`into_std_error()` and `StdError` for boundaries requiring that trait.
The adapter retains the union and its context; `as_union()` or `into_union()`
can recover them.

```rust
// Proposed bridge when a source must return an owned standard error.
let result: eros::Result<Vec<u8>> = read_remote_range();
result.map_err(|report| {
    SourceError::Provider(Box::new(report.into_std_error()))
})
```

This preserves the report, but **does not preserve the current source-chain shape
automatically**. `StdError::source()` forwards the original error's own source;
it does not expose the original error itself as an extra chain node. A caller
needing that concrete root uses the retained union. `into_inner()` instead
extracts the underlying error and discards context, location and backtrace.

Ordinary Eros `Display` does not include attached context frames. The earlier
evaluation therefore needed a Rust output formatter to combine context with the
original diagnostic. A future integration must settle that formatting at the
boundary; moving it to React would duplicate Rust responsibility. Debug output,
backtraces and terminal formatting are not a substitute for the UI message
contract. These details follow the reviewed
[`StdError` and union implementation](https://github.com/mcmah309/eros/blob/5a853901d090f60f8ed0d58c34f7fbe130526600/rs/eros/src/error_union.rs)
and [formatting implementation](https://github.com/mcmah309/eros/blob/5a853901d090f60f8ed0d58c34f7fbe130526600/rs/eros/src/formatting.rs).

## Eros integration: benefits and costs

This table evaluates a possible replacement of client error plumbing, not a
change to Polymorph, Tokio, filesystem messages or native selection.

| Aspect                     | Potential benefit                                                          | Cost or condition                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Custom `Failure` carrier   | Could remove storage, constructors and formatting dedicated to the carrier | Public Rust signatures, tests and consumers change; a wrapper around Eros plus the same old fields may save little                |
| Calling context            | Similar explicit attachment across operations                              | Context text does not preserve `operation()` or other typed accessors automatically                                               |
| Original causes            | Existing concrete errors can be retained                                   | Current code already does this; `StdError` integration changes standard traversal                                                 |
| Provider failures          | Could retain the existing `FileError` value directly                       | That type currently lacks `Display`/`Error`; it would need those implementations, and wire messages cannot recreate native causes |
| Typed composition          | Can declare the errors a particular API returns                            | Catch-all signatures do not gain that guarantee; typed unions need to serve an actual consumer                                    |
| WIT and JSON               | Can continue to expose stable portable values                              | Eros does not generate WIT schemas or decide classifications and UI wording                                                       |
| Dependency and maintenance | Shared library machinery replaces some local machinery                     | Adds a dependency and public API coupling; version changes, features, compile cost and Wasm size need evaluation                  |
| Execution behavior         | Explicit `.context(...)` keeps calls readable                              | Function-wrapping attributes and a new executor are outside the selected direction                                                |

No measured performance, binary-size or compile-time improvement is established
by the proposal.

## Possible future integration

The implementation remains on `thiserror` and `anyhow`. A future trial should
be a new review against the current checkout; prior Eros patches are proposals,
not an implementation baseline.

1. **Choose a concrete benefit.** Start with client/protocol result composition,
   where carrier construction is repeated. Do not change WebSocket ownership or
   add deadlines as part of error handling.
2. **Choose the public API deliberately.** A direct `eros::Result` exposes Eros
   to consumers. Keeping a project-owned public error can hide it, but may retain
   most of the code the trial intended to remove. Compare both before expanding
   the migration.
3. **Retain meaningful original errors.** Keep `ProtocolError` and upstream
   causes. Consider preserving the existing provider `FileError` before inventing
   another provider-error enum. Decide whether any typed operation context is
   needed; do not silently replace it with text.
4. **Preserve workflow separately.** Encoding failures occur before exchange;
   exchange/reply failures reset the transport; valid provider failures do not.
   Do not replay acquisition, merge independently failed steps or turn picker
   dismissal into failure.
5. **Qualify the actual boundaries.** Verify concrete cause access through source
   inspection and any `StdError` bridge, Rust-generated message formatting,
   provider-message preservation and unchanged WIT/JSON output where promised.
6. **Adopt only a net simplification.** Count removed carrier code together with
   new adapters, formatters, dependencies and public-API obligations. Reuse
   existing tests; add only checks for behavior introduced at our boundaries.

A narrow trial would leave `thiserror` on ordinary domain errors and `anyhow` in
service/tool orchestration. Removing either library globally is not a prerequisite
for trying Eros. Conversely, using Eros only as another box inside the unchanged
`Failure` structure would need a clear benefit to justify the extra layer.

## WIT contract design is independent of the error library

The current [WIT contract](../../crates/workbench/component/wit/native.wit)
carries concrete step outcomes. Small compatible types can be reused with the
component's explicit `wit-bindgen` `with` configuration. This removes duplicate
generated Rust definitions and matching code; WIT still declares the cross-language
contract.

The component already reuses `FailureKind`, `ContainerKind`, `MachOHeaderFormat`
and `AnalysisScope` through that configuration. Reusing a Rust type does not by
itself establish that an external consumer needs the corresponding WIT field.

The frontend currently displays error messages without reading structured
inspection detail or selection error classifications. That is selective use of
the current structured contract, not evidence that WIT should carry only messages.
A reusable component consumer may need declared error distinctions regardless of
its language or runtime. A presentation-specific API may deliberately expose a
smaller error shape.

The [error-boundary guide](error-boundaries.md#comparing-the-two-designs) compares
both valid designs and records criteria for reviewing individual fields. No
message-only migration is selected by that comparison. Public contract design,
reuse of compatible Rust types and adoption of Eros are separate decisions.
