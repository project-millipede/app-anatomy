# API and workflow design

Design operations around the result their consumers need and the guarantees their
owner can enforce. This guide governs responsibility placement, required work,
and control flow in new implementations and changes to existing APIs.

[Implementation simplicity](implementation-simplicity.md) defines how to assess
the whole design. [Infrastructure and ownership](infrastructure-and-ownership.md)
governs the coordination used inside an operation. The examples here are
illustrative API shapes, not declarations of existing repository exports.

## 1. Start from the caller's intention

**Rule:** the API must expose a coherent operation or useful capability. Callers
must not be required to reconstruct an owner's invariant through separate
preparation, validation, and completion calls.

Before choosing a signature, identify:

| Design question                       | Required answer                                                         |
| ------------------------------------- | ----------------------------------------------------------------------- |
| What does the consumer want?          | A domain operation or reusable lower-level capability.                  |
| What must its result guarantee?       | The facts consumers may rely on after success.                          |
| Who can enforce those guarantees?     | The owner of the resource, state, or boundary.                          |
| Which decisions belong to the caller? | Actual policy or composition choices, rather than internal preparation. |

For example, a selection operation needs a usable source. Requiring it to
reconstruct that source after acquisition can repeat work:

```rust
// Acquisition already opens and validates the handle.
let opened_file = directory.open_file(entry_id)?;
// Construction queries and validates that same handle again.
let file_source = FileSource::new(opened_file)?;
```

An acquisition API responsible for producing the source can expose:

```rust
let file_source = directory.open_source(entry_id)?;
```

The owner must actually consolidate the preparation. A forwarding helper that
still performs both metadata queries leaves the duplicate work intact.

**Limit:** a general filesystem API may intentionally return a raw handle.
Keep that useful capability when its consumers need it. Do not force every
lower-level library into one application's operation or a single large API.

## 2. Return a useful result with precise guarantees

**Rule:** return the value that satisfies the operation's declared contract.
Avoid making consumers repeat validation or assemble related fields solely to
obtain the promised result.

| Result design                                            | Consumer responsibility                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| Independently supplied handle, length, and validity flag | Reconstruct which facts belong together and when they were checked. |
| Source constructed by its acquisition owner              | Use the source according to its documented guarantees.              |

Use ownership and existing types to keep related facts together. Introduce a new
type when it enforces a meaningful invariant or expresses a useful domain result;
do not add one solely to rename a forwarded value. Preserve borrowing and zero-copy
access when callers benefit from them; returning an owned value is not a blanket
requirement to allocate or clone.

State the lifetime of each guarantee. A file being regular when opened does not
prove its contents or length remain unchanged. A checked identifier does not
reserve its resource indefinitely. Do not imply snapshot or transactional
semantics that the implementation does not provide.

## 3. Put validation at its authoritative owner

**Rule:** define each invariant at the layer responsible for enforcing it.
Callers must not substitute their preliminary observations for validation when
the owning operation acts. Reuse an invariant's implementation when independent
boundaries also need to enforce it.

Checks are not redundant merely because they concern the same input:

| Checks                                                   | Why both may be necessary                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Encoded-message validation and response/request matching | One validates a message; the other validates its relationship to an operation. |
| Pathname check and opened-handle validation              | They examine different states during resource acquisition.                     |
| Integer conversion and range arithmetic                  | Representability does not establish a valid range.                             |
| Host input checks and reusable Rust validation           | The ordinary Rust contract must hold without that host.                        |

Before removing a check, identify the exact invariant, the authoritative owner,
and the boundary or state transition between the checks. Follow
[integer conventions](../rust/integer-types.md) for representation decisions and
[Rust reuse](../architecture/rust-runtime-independence/README.md) for host boundaries.

## 4. Require a purpose for each workflow step

**Rule:** every preliminary query, transformation, or follow-up operation must
contribute information, a side-effect decision, or a result required by the
workflow. Do not retain a step only because the existing call sequence contains it.

### Observation does not reserve state

```text
Caller A: query selection -> resource F is selected
Caller B: replace F with G
Caller A: request F       -> owner must reject F
```

If the query serves only to authorize the next request, the owner still needs
to validate that request. A smaller workflow can request the operation directly:

```text
Repeated preflight:  query state -> compare identifier -> request operation
Owner validation:                                       request operation
```

**Limits:** a query can have another purpose, such as displaying state or avoiding
an unwanted external action. For example, checking for an abandoned request
before opening a native dialog prevents a visible side effect. Keep steps with
such responsibilities. Removing a preliminary query can also change error
classification; review that contract explicitly.

### Completion can require an independent operation

```text
Selection action -> success or failure
State query      -> observe the retained state after either outcome
Returned result  -> preserve both outcomes with their roles
```

Do not remove the state query as duplicate observation when observing the final
state is part of the contract. It does not retry the action. Follow the
[error-handling guidance](../architecture/error-handling.md)
when deciding which operations may continue and how their failures are reported.

## 5. Prepare replacements before changing retained state

**Rule:** when replacement must preserve the previous state on acquisition
failure, complete acquisition and validation before installing the replacement.
Do not introduce rollback machinery when that ordering satisfies the requirement.

```text
Avoidable restoration:
  remove old resource -> acquire replacement -> failure -> reconstruct old state

Preparation before installation:
  acquire and validate replacement -> failure -> old resource remains installed
                                  -> success -> install replacement
```

The owner must still coordinate competing changes and shutdown where required.
Preparation alone does not make publication atomic. Define the installation
boundary and what happens if installation itself can fail; do not promise
preservation beyond the actual contract. Coordination and resource lifetimes
belong in [infrastructure and ownership](infrastructure-and-ownership.md).

## 6. Let operation results drive control flow

**Rule:** use an operation's defined result instead of adding a preliminary
branch that supplies no additional guarantee. Keep necessary behavior visible
and use the language's ordinary control flow before introducing an operation framework.

For a response channel that already returns an unsent value when closed:

```rust
// A preliminary observation cannot guarantee that the receiver remains open.
if !response.is_closed() {
    let _ = response.send(selected_path);
}
```

When an abandoned reply may be discarded, the owner can state that policy directly:

```rust
// The caller may have stopped waiting; an undelivered reply is discarded.
let _ = response.send(selected_path);
```

This does not justify ignoring other failures. Successful sending also does not
guarantee that the receiver consumes the value. Preserve any required recovery or
reporting policy, and keep preliminary checks that avoid distinct side effects.

Use named operation results and keep test execution separate from assertions as
specified by [operation structure](../rust/operation-structure.md). Do not add
intermediate variables for every simple getter or result wrapper.

## 7. Make abstraction and compatibility decisions explicit

**Rule:** an abstraction must own a coherent responsibility, enforce an invariant,
or provide a required adaptation. It must not exist solely to shorten one call
while leaving its coordination obligations distributed across callers.

Evaluate the caller, owner, adapters, and error paths together. Direct function
composition is appropriate when the caller intentionally owns the workflow.
Several calls are not inherently a design defect, and a useful boundary does not
require a new crate, trait, component, or generic executor.

Define ordinary Rust APIs first. Keep platform capabilities in adapters and
selected WIT operations as projections of the Rust APIs, following the
[runtime independence contract](../architecture/rust-runtime-independence/README.md).
Review public return types, error classification, side-effect order, and consumers
when changing an API. Do not infer that a public capability is obsolete solely
from the absence of repository callers, or add permanent compatibility wrappers
without an identified compatibility requirement.

## Review questions

1. Can the caller express its intention without reconstructing the owner's work?
2. Does the result provide precisely the guarantees consumers need?
3. Does each check protect the same invariant, or a distinct boundary or state?
4. Does every workflow step contribute a required result or side-effect decision?
5. Are failure classification, retained state, and completion behavior explicit?
6. Does the proposed abstraction reduce total responsibilities or repeated work?
7. What existing evidence demonstrates the affected behavior and its failure path?

Use the [testing policy](../architecture/testing-policy.md) for evidence. Do not
create tests merely to protect shorter call sites or wrapper layout. Review
behavioral/API changes separately from expression-only readability changes and
keep the implementation within the selected operation's scope.
