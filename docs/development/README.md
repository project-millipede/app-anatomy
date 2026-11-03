# Development guidelines

These documents define implementation requirements for new features, changes,
reviews, and cleanup. They apply to ordinary Rust libraries, adapters, services,
TypeScript presentation and environment bindings, and repository tooling. They
complement the architecture contracts; they do not move Rust responsibilities into
TypeScript or add runtime requirements to the core.

**The governing objective is to reduce the responsibilities, work, and concepts
needed to implement and use an operation while preserving its intended guarantees.**

## Apply language practices as well as project rules

Applying the relevant practices is an automatic part of every implementation
request. The user does not need to name a guide, ask for idiomatic code, or repeat
these requirements.

Before producing code or a diff:

1. **Identify the affected languages and frameworks.** Use the request and target
   code, including each language involved in a change that crosses boundaries.
2. **Select the applicable guidance.** Read the shared guidelines, the relevant
   language guide and focused topics, and the owning package's configuration.
   For a language without a local guide, use its established practices. Consult
   official documentation for unfamiliar or version-sensitive behavior.
3. **Apply the practices while designing the solution.** Choose types, ownership,
   APIs, control flow, error handling, and lifecycle behavior deliberately. A
   short request does not waive these requirements, and an existing poor pattern
   is not a reason to repeat it.
4. **Review before presenting or applying code.** Check the proposed code against
   the applicable practices and repository contracts. Correct identified conflicts
   before delivery; explain necessary departures from recommended defaults.

This applies to illustrative snippets, diff-only responses, tests, and production
changes. It must happen before the first code output, not only in a later cleanup
or after the user identifies a problem. Use established language and platform
practices even when a specific case has not appeared in a documentation example.

Keep three kinds of guidance distinct:

1. **Language and platform facts** explain what a mechanism guarantees and what
   it cannot guarantee. For example, a TypeScript assertion does not validate a
   runtime value. An implementation must respect these limits.
2. **Implementation defaults** describe a sound starting point, such as borrowing
   Rust inputs when ownership is unnecessary. Use a different approach when the
   operation's concrete requirements justify it; explain a non-obvious tradeoff
   at the owning code or API.
3. **Repository requirements** constrain the design, including Rust-owned domain
   behavior, explicit runtime ownership, and scoped testing. A generally useful
   pattern does not override those requirements.

The language guides link primary documentation for the mechanisms they describe.
The rules are a baseline for engineering judgment, not a complete catalogue or
proof that existing code already complies. Improvements remain limited to the
task's authorized scope.

## Find the owning guideline

| Design question                                                                                                    | Owning document                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| What counts as simplification across APIs, workflow, control flow, synchronization, readability, and dependencies? | [Implementation simplicity](implementation-simplicity.md)                        |
| What should a caller request, receive, validate, or compose?                                                       | [API and workflow design](api-and-workflow-design.md)                            |
| When are locks, permits, queues, workers, retries, or lifecycle mechanisms justified, and who owns them?           | [Infrastructure and ownership](infrastructure-and-ownership.md)                  |
| How should Rust code express ownership, types, APIs, failures, resource lifetimes, and safety?                     | [Rust implementation practices](../rust/implementation-practices.md)             |
| How should TypeScript code express types, boundaries, mutation, asynchronous work, and React lifecycle?            | [TypeScript implementation practices](../typescript/implementation-practices.md) |

These are independent design concerns. Reading a guideline does not require
introducing its mechanisms or changing every related subsystem. A small change
may concern only one responsibility.

## Required design discipline

1. **Start with the required operation and its owner.** Prefer direct calls,
   straightforward execution, and explicit ownership. The caller must not need to
   reconstruct an operation's internal preparation or coordination.
2. **Justify additional machinery.** Introduce concurrency, synchronization,
   queues, workers, retries, or lifecycle machinery only for a demonstrated
   requirement that the simpler model cannot adequately satisfy.
3. **Encapsulate a complete responsibility.** Required machinery belongs in a
   cohesive owning implementation with a reusable API. Callers must not repeatedly
   assemble its locking, scheduling, state transitions, and cleanup.
4. **Review the whole implementation.** Include the caller, owner, adapters,
   dependencies, failure paths, and lifetimes. Fewer caller lines alone do not
   establish a simpler design.
5. **Keep guarantees explicit.** Simplification must preserve the intended
   contract. Any intentional change to that contract must be identified and
   evaluated with its affected consumers.

These are project requirements, not claims that Rust requires a particular
expression style or that all existing code already complies. Their application
must remain proportional to the work in scope. Report unrelated issues without
turning a focused change into a repository-wide rewrite.

## Detailed policies remain with their owners

| Concern                                          | Existing authority                                                                                          | Relationship to these guidelines                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Rust-only operation and execution boundaries     | [Rust reuse across execution environments](../architecture/rust-runtime-independence/README.md)             | Determines where reusable semantics and platform capabilities belong.              |
| Resource and protocol lifetimes                  | [Filesystem communication flow](../architecture/rust-runtime-independence/filesystem-communication-flow.md) | Defines the concrete selection, transport, and shutdown contracts.                 |
| Propagation, recovery, diagnostics, and cleanup  | [Error-handling guidance](../architecture/error-handling.md)                                                | Owns the meanings of execution and reporting after failure.                        |
| Names, expressions, and Rust temporary lifetimes | [Operation structure](../rust/operation-structure.md)                                                       | Owns local code structure after the operation and owner have been chosen.          |
| Integer domains and representation boundaries    | [Integer types and conversions](../rust/integer-types.md)                                                   | Owns conversion and range decisions; simplification must not invent new fallbacks. |
| Meaningful test evidence                         | [Testing policy](../architecture/testing-policy.md)                                                         | Owns scenario selection, assertions, fixtures, naming, and cleanup.                |
| Pinned component build inputs                    | [WIT dependency workflow](../../wkg/README.md)                                                              | Owns the concrete acquisition and verification commands.                           |

Use these authorities for their detailed rules. Do not reproduce a second error
policy, testing policy, or runtime contract inside a design guideline. If a
proposed simplification changes an established guarantee, identify and update its
owning contract as part of that change.

## Applying the guidance

### New implementation

Define the caller's intended operation, result, and owner before selecting
mechanisms. Choose the smallest adequate API and execution model. If infrastructure
is required, explain the invariant or capability it supplies and implement its
complete lifecycle at that owner.

### Existing implementation

Identify one concrete source of unnecessary responsibility, work, or coupling.
Compare caller and owner before and after the proposed change. Keep unrelated
cleanup independent. A useful local improvement does not require resolving every
design concern in this documentation.

### Review and evidence

Check both ordinary operation and relevant failure/lifetime behavior. Prefer
existing meaningful evidence, following the testing policy and repository
validation requirements. Do not add tests solely for renamed helpers, fewer
statements, or standard-library guarantees. State untested execution modes
explicitly and do not claim performance gains without measurement.
