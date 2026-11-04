# Error handling contracts and library choices

Status: workflow failure contract and acquisition-error contract updated on
2026-11-02; error-library comparison last reviewed on 2026-10-15.
Ordinary Rust APIs retain owned errors; executables use `anyhow` for orchestration.
Eros is **not an application dependency or an adopted migration**. The Eros
evaluation below refers to version **0.8.1**, not an unspecified latest release.

This document owns the common workflow failure contract, its application at
owning APIs, and the error-library comparison and integration criteria.
The [error-boundary guide](error-boundaries.md) compares structured and message-only
WIT contracts, binding conversion and selective presentation with separate
sequence diagrams. Neither contract design is prescribed for every consumer.
The [Rust reuse contract](rust-runtime-independence/README.md) owns execution
boundaries and workflow semantics. The [filesystem communication flow](rust-runtime-independence/filesystem-communication-flow.md)
owns the transport and native-selection lifecycle.

## Workflow failure contract

Rust supplies the primitives for stopping, recovering and retaining results.
The project must choose their meaning for each operation; this does not require
a new error-handling framework.

> Every observed failure must be resolved by a defined recovery, returned to the
> caller, or retained for a named reporting boundary. Further execution must be
> justified by the operation's dependencies.

Every owning API must answer two separate questions:

| Decision  | Question                               | Choices                                                                                                                |
| --------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Execution | What can still run after this failure? | Stop dependent work, recover, or continue with work that remains valid.                                                |
| Reporting | Who receives the failure?              | Return it immediately, preserve individual outcomes, return an aggregate, or report at a designated terminal boundary. |

Collecting errors does not make further execution valid. Returning an error does
not itself permanently disable the underlying source or owner.

### Rust primitives and their effects

| Intended behavior                                          | Rust mechanism                                                      | Effect                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Stop a dependent operation                                 | `Result<T, E>` with `?`                                             | Return the error from the enclosing function, closure or async block.   |
| Handle a failure individually                              | `match` on `Result`                                                 | Recover from recognized cases; propagate or report unresolved failures. |
| Attempt independent items and preserve every outcome       | Loop storing `Vec<Result<T, E>>`                                    | Keep successes and failures in order.                                   |
| Return one failed operation containing several diagnostics | `Result<T, AggregateError>`                                         | The error value contains the collection.                                |
| Stop iteration at the first failure                        | `collect::<Result<Vec<T>, E>>()`                                    | Stop consuming the iterator when an error appears.                      |
| Run cleanup despite failure                                | Save the operation result, execute cleanup, then match both results | Resolve all four success/failure combinations explicitly.               |

**`collect::<Result<…>>()` stops at the first error; it does not collect all
errors.** Keeping a `Vec<Result<T, E>>` preserves each outcome instead. Stopping
iterator consumption cannot undo calls that have already executed.

**On failure, `?` returns early from its enclosing function, closure or async
block.** It does not terminate the application, roll back previous effects,
cancel other running tasks, or await asynchronous cleanup. An inner async block
can return its failure to an outer function that then performs cleanup, as
`serve` does below.

These are ordinary Rust choices described in the
[Rust Book](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html)
and [Rust By Example](https://doc.rust-lang.org/rust-by-example/error/iter_result.html).

### 1. Required processing: stop and return

**Rule:** stop when later work requires a result that the failed operation did
not produce. Return that failure with `?`; do not invent substitute data merely
to continue processing.

```text
Read required header → failure A
Parse commands       → not attempted; requires the header
Return               → A
```

No command-read failure has been encountered in this example. Reporting only A
does not discard a second error: the dependent operation never ran.

**Implemented owners:** the [Mach-O parser](../../crates/binary/inspection/src/macho/report.rs)
propagates failures from required header and command-table reads.
[`Session::inspect`](../../crates/workbench/operations/src/inspection.rs) likewise
requires successful selection validation and metadata acquisition before analysis.
An available cache does not make those prerequisites optional.

### 2. Independent processing: retain individual outcomes

**Rule:** continue when the next operation remains meaningful even if the
previous one failed. Retain each result rather than returning early with `?`.

```text
Selection action    → failure A
Query current state → failure B; still meaningful after the action failed
Return              → [action: Err(A), query: Err(B)]
```

If the query succeeds, return `[action: Err(A), query: Ok(state)]`. Its success
does not erase the action failure. The query observes current state; it does not
retry the selection action.

**Implemented owner:** the [selection workflow](../../crates/workbench/operations/src/session.rs)
preserves these named results in `Outcome.steps`. This is the domain-specific
equivalent of retaining `Vec<Result<T, E>>`; it also identifies each step and can
represent its distinct output. No generic operation runner is needed.

### 3. Acquisition: fail the request and preserve its diagnostic

**Rule:** a failed acquisition fails that read immediately. Keep its detailed
diagnostic until inspection completion. Later explicit reads remain possible;
the parser decides whether they occur.

The adapter must retain the detail separately because the upstream
`ReadCacheOps` interface reports a failed read only as `Err(())`. In production,
the recording mechanism is:

```rust
self.retained_input_errors.push(error);
return Err(());
```

The following is an illustrative sequence of explicit requests, not a promise
that a parser continues after failure:

| Request           | Current read result           | Retained diagnostics                   |
| ----------------- | ----------------------------- | -------------------------------------- |
| Read `2..4`       | Failure A                     | `[A]`                                  |
| Read `4..6`       | Success                       | `[A]`                                  |
| Read `6..8`       | Failure B                     | `[A, B]`                               |
| Read `2..4` again | Failure A again               | `[A, B, A]`                            |
| Finish inspection | Acquisition failure aggregate | Return all three diagnostics in order. |

Successful reads and ordinary cache misses add no diagnostics. Bounds and
allocation errors originating in the upstream cache are not relabeled as
acquisition failures. There is no automatic retry, deduplication or additional
read to discover errors.

**Implemented owners:** [`SourceCursor::read_exact` and `SourceCache::finish`](../../crates/binary/inspection/src/input/cache.rs)
record and return the collection. Both [`inspect_source`](../../crates/binary/inspection/src/macho/mod.rs)
and [`inspect_object_source`](../../crates/binary/inspection/src/object_report.rs)
use this completion policy:

- If acquisition errors exist, return the aggregate even if the parser returned
  a report or its own parsing error.
- Otherwise, return the parser's original report or parsing error.

Independent failures belong in a collection or separate fields.
`Error::source()` describes the underlying cause of **one** failure; it is not an
error-history mechanism. Each acquisition diagnostic retains its own cause chain.
See the [Rust error-source contract](https://doc.rust-lang.org/std/error/trait.Error.html#method.source).

### 4. Cleanup: execute it and preserve both failures

**Rule:** after the main operation returns, run its required cleanup before
deciding the final result. For service completion, return both failures when both
occur, identified by their roles.

| Main operation | Cleanup   | Required returned outcome                            |
| -------------- | --------- | ---------------------------------------------------- |
| Success        | Success   | Success                                              |
| Failure A      | Success   | A                                                    |
| Success        | Failure B | B                                                    |
| Failure A      | Failure B | Both A and B: operation failure and cleanup failure. |

Evaluate the operation and cleanup separately, retain both results, and then
match the pair. Do not propagate the operation's error out of the completion
function with `?` before cleanup runs. `cleanup.and(result)` also fails to
implement this contract: when both fail, it returns the cleanup error and drops
the original error.
See [`Result::and`](https://doc.rust-lang.org/std/result/enum.Result.html#method.and).

**Implemented owner:** [`serve`](../../crates/services/filesystem/src/server/mod.rs)
runs shutdown before resolving the service result. When both fail,
`ServiceCompletionErrors` retains the original `service_error` and
`shutdown_error` separately and formats both cause chains. The remaining cases
use `Result::and` only after simultaneous failure has been excluded, preserving
the single error unchanged or returning success.

Callers receive the combined diagnostic through `anyhow::Error`; the aggregate
and its members are not part of the public API. The aggregate has no
`Error::source()` because neither independent failure caused the other.

Required asynchronous cleanup must be awaited explicitly. This contract covers
normal success and error returns; it does not promise cleanup completion after
task cancellation or a panic. A terminal reporting exception, such as the
connection handling below, must name where the secondary failure is reported.

### 5. Individual handling: recover or report deliberately

**Rule:** use `match` when this layer can act on a particular failure. A recovery
must establish a valid state or substitute result before dependent work resumes.
Return or report failures that this layer cannot resolve.

An API that permits a missing optional value could recover with an explicitly
defined default. That is not permission to replace required binary bytes with
defaults. A successfully handled condition need not enter the final failure
result unless the API promises a record of recovery attempts.

Logging is a reporting action. It does not repair the failed operation or prove
that continuing it is safe. If logging is the final destination for a failure,
state that explicitly rather than claiming that the caller receives it.

**Implemented reporting exception:** [`receive`](../../crates/services/filesystem/src/server/mod.rs)
ends the failed connection path and uses these policies:

| Initial failure   | Follow-up action                | If that action also fails                    |
| ----------------- | ------------------------------- | -------------------------------------------- |
| Receive failure A | Attempt to flush the connection | Print failure B to service stderr; return A. |
| Invalid request A | Attempt a protocol-close reply  | Print failure B to service stderr; return A. |

The connection owner reports A. B is available only in the service log and is
absent from the returned error. Neither path resumes request processing. This is
an explicit terminal reporting policy, separate from returning both errors at
service completion.

Ordinary native-picker dismissal is a different case: the action succeeds and
keeps the previous selection. It must not be turned into an error that then
requires recovery.

### 6. Later attempts: define retry state explicitly

**Rule:** identify the lifetime of retained failures: one request, one inspection,
or one owner. Retaining an earlier result must not implicitly poison a new
operation. A retryable owner must permit a later explicit attempt while it is
active; disposal remains terminal. Permitting another attempt does not guarantee
success or start an automatic retry loop.

```text
Inspection 1 → read fails with A → return failure [A]; consume its cache
Inspection 2 → create a fresh cache and empty collection
             → reads succeed → return report
```

The caller may still retain the first result containing A. That result does not
participate in the second inspection. If the underlying problem persists, the
second inspection observes a new failure instead. Inspection does not release or
replace the native selection; another client may still replace it.

**Implemented owners:** the [source inspection entry points](../../crates/binary/inspection/src/macho/mod.rs)
create a new cache for each call. The browser's
[`createNativeRuntime().getSession()`](../../packages/apple-code-browser/src/native/runtime.ts)
also resets failed component/session initialization so a later explicit call can
try again while the runtime remains active. Disposal prevents further access
through that runtime.

**Implementation gap:** the outer [`useNativeSession`](../../apps/web/features/workspace/useNativeSession.ts)
hook still keeps a rejected adapter-import promise until its effect is recreated.
Later accesses observe that same rejection without a new import attempt. Changing
this stage to permit a later explicit attempt requires separate implementation
work; the inner runtime's retry behavior does not repair it.

### Apply the contract without changing behavior implicitly

The owner descriptions above distinguish implemented behavior, reporting
exceptions and implementation gaps. Changing which work executes or which errors
reach a caller is a production contract change. Review the owning API and its
consumers together; do not introduce it through readability or error-library
cleanup. Boundary conversion must preserve the diagnostics promised by that API.

## Rust API failure contracts

**Rule:** fallible reusable Rust operations must expose a concrete error contract
that lets callers distinguish the failures promised by the operation. Preserve
their relevant context and available original causes. Human-readable messages
supplement that contract; callers must not parse messages to recover missing
classifications.

This is a repository design requirement. Rust permits both concrete and
type-erased errors.

### 1. Choose the smallest adequate error type

Reuse an existing error type when it expresses the operation's failures.
Introduce a domain error only when the operation needs meaningful distinctions
or additional evidence.

| Operation                                                 | Appropriate contract                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Writing and flushing an output                            | `std::io::Error`, when these are the only returned failures                |
| Awaiting a Tokio task                                     | `tokio::task::JoinError`, within the implementation that owns that runtime |
| Inspecting binary structure                               | The existing `AnalysisError`                                               |
| Inspecting through a fallible source                      | The existing `InspectionError`                                             |
| Completing an operation that can also fail during cleanup | A concrete result exposing both failure roles when both occur              |

Do not introduce one custom error type per function, a repository-wide error enum,
or a new error framework merely to make signatures look uniform. Runtime-specific
error types must remain outside runtime-independent code.

### 2. Expose meaningful distinctions, not merely a named wrapper

A concrete type is useful only if callers can inspect its promised classifications
and evidence through variants or accessors.

For example, an operation-and-cleanup failure must let callers distinguish the
operation failure from the cleanup failure. Formatting both into one message does
not provide that structured access.

Fields may remain private. The requirement is a usable public contract, not public
mutable storage.

A domain error may retain an unknown provider's original cause through
`Box<dyn Error>`. It need not expose every backend type as a public variant.

### 3. Keep error types explicit; avoid unnecessary runtime type recovery

**Rule:** expose promised failure distinctions through declared types or
accessors. Avoid unnecessary type erasure and runtime recovery. Checked
downcasting is permitted at deliberately type-erased boundaries when the
consumer defines what an unrecognized type means.

#### 3.1. Retain known failures directly

Use an existing concrete error, an enum variant or a typed field. Accessors
should inspect that representation directly.

| Current pattern                                                                   | Intended pattern                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Receive `ProtocolError`, box it as a generic cause, then downcast it when queried | Retain `ProtocolError` as a typed payload and borrow it directly      |
| Box a combined failure and require callers to discover its concrete type          | Return a declared error contract exposing the independent failures    |
| Recover a promised failure category by searching a cause chain                    | Obtain the required classification or evidence through the owning API |

#### 3.2. Apply the rule inside helpers too

A typed accessor may use checked downcasting over intentionally type-erased
storage when its guarantees and unmatched case are explicit.

Apply the same boundary requirements to concrete-type checks such as
`is::<T>()` or `TypeId`. Message parsing, type-name comparisons and undocumented
cause-chain depth are unsuitable substitutes for a declared error contract.

#### 3.3. Preserve opaque causes without making them a hidden handling API

An adapter may retain an implementation-specific cause as `dyn Error` for
diagnostic reporting. `Error::source()` remains useful for presenting causal
information.

Provider-aware consumers may also downcast for additional inspection or handling;
they must define the unmatched case. Downcasting does not bypass private fields
or replace the owner's visibility and accessor decisions.

Information required by the generic API must be represented explicitly
before that cause becomes opaque. Keep that responsibility at the appropriate
owner; do not introduce filesystem-client or runtime dependencies into the
analysis core merely to expose backend types.

#### 3.4. Apply the same design discipline to tests

New tests should verify the declared error contract through variants and
accessors. A focused test may downcast a deliberately type-erased cause to verify
preservation of the supplied error and its details.

Existing cause-preservation tests need individual review. Removing their downcasts
must not silently remove evidence that original failures survive the boundary.
Establish the intended access contract before changing those assertions. Do not
replace that evidence with message assertions, pointer comparisons or a weaker
check that merely establishes the presence of an error.

#### 3.5. Keep migration scoped

Apply this rule to new and substantively revised error APIs and tests. Existing
downcasts require individual review with the owning API, not automatic removal.
Preserve justified access across type-erased boundaries; keep any migration scoped.

### 4. Keep generic reporting at a deliberate reporting boundary

`anyhow` is appropriate for executable orchestration and terminal reporting where
the consumer's responsibility is to present or propagate a diagnostic.

Do not use `anyhow`, boxed errors or strings as the default replacement for a
reusable operation's error contract simply because conversion is convenient.

Neither a function's `pub` keyword nor its location determines the appropriate
contract. Likewise, a current caller that only prints errors does not establish
that a reusable API needs no structured failure access.

`anyhow` can preserve original error objects. The limitation is that its signature
does not declare the operation's failure categories.

### 5. Preserve independent failures as independent information

When an API promises multiple failures, expose them individually with their roles
or occurrence order. Each member retains its available cause.

Do not place independent failures into an artificial `Error::source()` chain. Do
not hide promised members behind a private aggregate that callers can only format.

The [workflow failure contract](#workflow-failure-contract) determines whether
execution stops, recovers or continues. Choosing an aggregate error type does not
authorize retries or further processing.

### 6. Review information loss at every boundary

A concrete outer error type does not guarantee that conversions preserve its
useful distinctions.

When converting to another Rust error, a filesystem message, WIT or JSON:

- Preserve the classifications and evidence promised by the destination contract.
- Identify deliberate reductions; do not make them accidental consequences of
  calling `to_string()`.
- Do not claim to preserve concrete causes that never crossed the boundary.
- Treat removing structured information as a contract change.

The [error-boundary guide](error-boundaries.md) defines when a deliberately
presentation-specific, message-only contract is appropriate.

### 7. Apply the rule prospectively and migrate existing APIs deliberately

Apply this rule when introducing an operation or substantively changing its API
or failure behavior. Review the producer, intermediate conversions and consumer
together.

Existing uses require scoped evaluation. This section does not authorize
repository-wide rewrites or changes to execution, shutdown or recovery behavior.

Current implementation descriptions must remain accurate until migration occurs.
In particular, the service's private completion aggregate currently provides
combined reporting, not a publicly inspectable service failure contract.

## Current responsibilities

| Owner                           | What it supplies                                     | What callers retain                                                            |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Native filesystem operations    | Actual I/O errors from opening, listing and reading  | Native error type and OS code where available                                  |
| Binary inspection               | Upstream decoding errors and input failures          | Parsing cause, or all acquisition causes and available read information        |
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

For acquisition failures, the outer owned cause chain ends at the aggregate:

```text
InspectionFailure → InspectionError → InputErrors
```

`InputErrors::errors()` borrows the individual members; `into_errors()` transfers
ownership. These are independent failures, so `InputErrors::source()` is `None`.
After selecting a source-failure member, its own chain can be:

```text
InputError::Source → SourceError::Provider → Failure
  → original backend or protocol error
```

The component's [conversion](../../crates/workbench/component/src/inspection_error.rs)
projects each member into the ordered, nonempty WIT `details` list. Selection,
metadata and analysis failures each produce one diagnostic. The complete message
is formatted in Rust before conversion: singleton text is unchanged, and multiple
acquisition failures are numbered on separate lines. `Failure` is not serialized
directly.

The [acquisition policy](#3-acquisition-fail-the-request-and-preserve-its-diagnostic)
defines recording and completion. Preserving the promised diagnostics and their
available causes is an input-integration responsibility; changing the error
library must preserve it.

### Steps and successful dialog dismissal

`Outcome<Step>` contains ordered `StepOutcome<Kind, Output, Error>` values.
These are result data, not an executor or error framework.

The [independent-processing policy](#2-independent-processing-retain-individual-outcomes)
defines the selection action and query sequence, including its separate results
and absence of action replay.

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
