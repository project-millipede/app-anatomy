# Implementation simplicity

This document defines how to assess implementation simplicity. The
[API guide](api-and-workflow-design.md) owns caller and workflow boundaries;
[infrastructure and ownership](infrastructure-and-ownership.md) owns the necessity
and encapsulation of coordination mechanisms.

## 1. Definition and scope

**Simplification reduces the responsibilities, work, or concepts needed to
implement and use an operation while preserving its intended guarantees.**

Assess the complete design: caller, owning implementation, adapters, dependencies,
and failure/lifetime behavior. A shorter expression or a new forwarding helper
does not by itself prove an improvement. An abstraction can be valuable when it
removes a responsibility from its callers and enforces it coherently at its owner,
even when necessary internal operations remain.

These requirements apply when designing new behavior and when reviewing existing
behavior. They do not prescribe a repository-wide refactor or require every change
to address every concern below.

## 2. Six independent perspectives

| Perspective                      | Design question                                                                         | Useful evidence                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| API and responsibility placement | Does the caller request and receive what it actually needs?                             | Fewer preparation or coordination decisions at callers.                                 |
| Workflow and required work       | Which operations are necessary for the intended outcome?                                | An unnecessary query, conversion, acquisition, or repeated check disappears.            |
| Control flow                     | Which branches represent real choices or recovery?                                      | A redundant observation/branch is replaced by the operation's existing result contract. |
| Ownership and synchronization    | Can simpler ownership satisfy the invariant?                                            | Less shared state, or one clear owner for required coordination.                        |
| Readability and local structure  | Can a reader follow meaningful operations, results, and lifetimes?                      | Explicit stages and descriptive values without mechanical expansion.                    |
| Dependencies and build workflow  | Which libraries, tools, features, and preparation steps does this target actually need? | Fewer unnecessary requirements with the same declared capabilities.                     |

The perspectives overlap. Returning a validated source can improve both the API
and the workflow. Improving variable names may clarify the same workflow without
removing any work. Describe the actual improvement rather than treating all
changes as equivalent.

## 3. API and responsibility placement

**Rule:** an API must expose a coherent operation at its intended abstraction
level. Callers must not reconstruct guarantees that the operation promises.
The result should satisfy the caller's need without duplicated preparation.

A low-level API may deliberately expose primitives for independent composition.
Do not force every reusable capability into an application-specific operation.
[API and workflow design](api-and-workflow-design.md#1-start-from-the-callers-intention)
owns the validated-source example, useful-result guarantees, and abstraction
boundaries.

## 4. Workflow and required work

**Rule:** every operation must contribute required data, an authoritative
decision, an intended effect, or necessary completion/reporting. Identify that
purpose before removing a query, check, transformation, or completion step.

The [workflow rules](api-and-workflow-design.md#4-require-a-purpose-for-each-workflow-step)
show how to distinguish an unnecessary preflight from a required final-state
query. The [validation rules](api-and-workflow-design.md#3-put-validation-at-its-authoritative-owner)
explain why separate trust boundaries and acquisition states can require separate
checks. Changes to operation order, error classification, or side effects must
be reviewed as contract changes.

## 5. Control flow

**Rule:** branches must express meaningful choices, prerequisite failures,
recovery, or completion policy. Use an operation's result contract instead of a
preliminary observation that provides no additional guarantee.

The [control-flow examples](api-and-workflow-design.md#6-let-operation-results-drive-control-flow)
distinguish redundant channel-state observations from checks that avoid a separate
side effect. The [error-handling guidance](../architecture/error-handling.md)
owns propagation and completion: an early return must not bypass required cleanup
or discard independent results. A generic executor is not a default solution to
a local decision.

## 6. Ownership and synchronization

**Rule:** start with direct calls, explicit ownership, and the simplest execution
model that satisfies the requirement. Additional coordination must have a
demonstrated purpose and a responsible owner.

[Infrastructure and ownership](infrastructure-and-ownership.md) owns the rules,
examples, and limits for introducing locks, permits, queues, tasks, retries, and
lifecycle coordination. Necessary synchronization may remain inside a simpler
owning API; shorter callers do not justify weakening its protected invariant.

## 7. Readability and local structure

**Rule:** make meaningful operations, results, and lifetimes visible through
clear stages and descriptive names. This helps a reader understand the design;
it does not establish that every visible operation is necessary.

[Operation structure](../rust/operation-structure.md) owns the examples and rules
for expression layout, assertions, and temporary lifetimes. It also identifies
simple expressions that should remain concise. Do not manufacture intermediate
variables, wrappers, or branches for every getter or result constructor.

[Integer types and conversions](../rust/integer-types.md) owns representation
choices. Removing a cast by adding an unjustified fallback or changing the
value's domain is not a readability improvement.

## 8. Dependencies and build workflow

**Rules:**

1. Introduce a library or tool for a required capability, considering its adapters,
   transitive dependencies, supported targets, maintenance, and public API exposure.
   Reuse a qualified implementation when it reduces the total responsibility.
2. Enable target-specific dependencies and features only where required. Do not
   make a portable Rust operation depend on a service, JavaScript, or a component
   runtime merely because one consumer uses that environment.
3. Keep preparation, verification, compilation, and publication responsibilities
   explicit. An ordinary build should not repeat acquisition of unchanged verified
   inputs without a requirement for that revalidation. Input existence alone does
   not establish identity or integrity.
4. Commands must make their side effects clear. Design verification to report on
   inputs without silently replacing them; intentional refresh belongs in an
   explicitly mutating operation. Preserve each established tool contract until
   a deliberate migration changes it.
5. Define what happens to usable outputs when a replacement build fails. Hiding
   partially completed publication behind one command does not make it a coherent
   completion boundary.

Examples of design questions:

| Situation                                                               | Simpler direction to evaluate                                 | Guarantee to retain                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Every host enables a platform-specific packaging recipe's dependencies. | Enable them only for the relevant host/target.                | Each supported recipe still has its required capabilities. |
| Every rebuild downloads an unchanged input.                             | Reuse inputs whose identity and integrity have been verified. | Pinned upstream identity and required validation.          |
| Several tools partially overwrite a usable output set.                  | Give preparation and publication a clear completion contract. | Defined behavior on generation and publication failure.    |

These questions do not prescribe a new dependency cache, tool runner, or
transaction framework. Follow the existing [WIT workflow](../../wkg/README.md)
and [Rust reuse contract](../architecture/rust-runtime-independence/README.md)
for their concrete responsibilities. Temporary output directories alone do not
make replacement across several locations atomic.

## 9. Evidence and limits

Before claiming simplification, state what responsibility, operation, dependency,
or concept is reduced and where the remaining guarantees are enforced. Review
failure, cancellation, cleanup, and resource ownership as well as success.

For a changed public contract, review affected consumers and document the intended
behavior. For a readability-only change, preserve operation frequency, error
semantics, and lifetimes. Reuse meaningful tests under the
[testing policy](../architecture/testing-policy.md); fewer lines and standard
library mechanics do not need their own test suite.

Keep changes proportional to their purpose. A cleanup task does not authorize
unrelated API migration, dependency replacement, or synchronization redesign.
Report untested execution modes, and measure before claiming performance or
build-time improvements.
