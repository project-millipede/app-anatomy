# Infrastructure and ownership

## Purpose and scope

These rules govern synchronization, scheduling, retries, and resource-lifecycle
machinery in new implementations and changes to existing code. They apply to
reusable Rust, platform adapters, services, permitted TypeScript UI lifecycle and
environment bindings, and build tools. The language guides explain their specific
mechanisms; these rules govern whether those mechanisms are needed and who owns them.

**Infrastructure must serve a demonstrated requirement. Its owning implementation
must manage the complete coordination contract. Callers must not repeatedly
reconstruct that contract from locks, channels, tasks, and cleanup steps.**

This document owns the decision to introduce machinery and where its mechanics
belong. [API and workflow design](api-and-workflow-design.md) owns the operation
exposed to callers. [Implementation simplicity](implementation-simplicity.md)
defines how to assess the overall improvement.

## 1. Establish the need before choosing the mechanism

### Rule

Start with direct calls, exclusive ownership or borrowing, immutable data, and
sequential execution. Add coordination only when that model cannot satisfy the
required behavior. A mechanism's availability or possible future usefulness is
not sufficient justification.

Before introducing a mechanism, identify:

1. **Requirement:** the observable behavior or protected invariant.
2. **Participants:** which callers, tasks, or processes can compete.
3. **Lifetime:** when coordination starts and when it may end.
4. **Simpler alternative:** why ownership or direct execution is insufficient.

Record the reason at the owning API or implementation, in proportion to its
complexity. An ordinary local invariant may need only a short comment; it does
not require a separate design document.

A specified behavior or platform execution constraint can establish the need
before implementation. There is no requirement to first ship a failing simpler
implementation or measure a correctness requirement as a performance problem.

### Mechanism selection

| Mechanism                     | Requirement that can justify it                                                                    | Simpler approach to consider first                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Mutex or read/write lock      | Concurrent access to shared state must preserve an invariant.                                      | One owner, exclusive borrowing, or immutable data.        |
| Semaphore or admission permit | A resource permits a bounded number of simultaneous operations.                                    | Sequential invocation by an existing owner.               |
| Queue or channel              | Work or ownership must cross an actual execution boundary, or waiting work needs a defined policy. | A direct call with an owned argument and return value.    |
| Worker or background task     | Required concurrency or blocking work is incompatible with the caller's execution context.         | Direct execution in a suitable existing context.          |
| Retry mechanism               | A defined failure is recoverable and repeating the operation is permitted.                         | Return the failure and permit a later explicit attempt.   |
| Lifecycle coordinator         | Multiple operations or resources require coordinated startup, cancellation, or shutdown.           | One resource owner with explicit creation and completion. |

“Last resort” means the simpler model cannot meet the requirement. It does not
mean replacing a required lock with unsafe access or suppressing a required
worker to reduce line count. Async APIs are appropriate when their execution
contract requires them; `async` alone does not justify spawning another task.

## 2. Keep the complete responsibility with one owner

### Rule

The owner must control admission, resource access, execution, completion, and
release for the responsibility it exposes. Application callers should request
that operation without manually assembling its coordination protocol.

The following is an illustrative ownership comparison, not a prescribed API:

```text
Scattered caller responsibility
  acquire dialog permit
  create reply channel
  submit native-dialog work
  wait for its result
  release permit and dispose of an abandoned result

Owning API
  caller:  request dialog -> receive selection, dismissal, or failure
  owner:   admission -> dispatch -> result delivery -> resource release
```

For example, a caller can express its intent with:

```rust
let selected_path = picker.choose(mode).await?;
```

The improvement is that the picker owns admission and dialog lifetime. Merely
putting the scattered statements into a forwarding helper does not establish
that ownership, especially if the caller still has to release its permit.

### Boundaries

- Keep synchronization details private unless coordination is deliberately part
  of the API's purpose. A low-level guard API can be appropriate when its caller
  is the actual lifetime owner; document that obligation explicitly.
- Write the necessary lock, queue, or task operations inside the owning
  implementation. Do not extract every primitive call into another helper merely
  to remove it from sight.
- Do not move domain behavior into a transport or host binding to hide machinery.
  Follow the [Rust reuse contract](../architecture/rust-runtime-independence/README.md).

## 3. Reuse the owner and qualified primitives

### Rule

Implement a coordination responsibility once and reuse its meaningful API.
Prefer existing repository owners and qualified library capabilities over local
copies of scheduling, locking, or retry protocols.

A dedicated owner is justified when it establishes a coherent invariant, even
with one current caller. A generic execution framework, configurable state
machine, or new abstraction layer needs an additional demonstrated requirement.
Do not introduce one merely because several unrelated operations use a mutex.

For example, a dialog permit and a process-instance lock both exclude competing
work, but they have different participants, lifetimes, and failure behavior.
Those similarities alone do not justify a shared application lock manager.

Represent actual states directly where that simplifies the owner. A small enum
that excludes invalid states can be simpler than several coordinated booleans;
it does not imply a need for a general state-machine engine.

## 4. Make lifetime and cancellation part of the contract

### Rule

The owner's contract must define how coordination behaves on success, failure,
caller abandonment, and shutdown. Releasing a guard or permit must correspond to
the end of the protected activity, not merely the end of one caller's interest.

### Example: a dialog outlives its caller

```text
Caller requests dialog -> owner acquires permit -> native panel opens
Caller stops waiting  -> panel remains visible -> permit remains held
User closes panel     -> result is delivered or discarded -> permit is released
```

Releasing admission when the caller stops waiting would permit another panel
while the first still exists. The request or worker that owns the visible panel
must therefore retain the required coordination until that activity ends.

### Required distinctions

- **Observation versus reservation:** checking that a resource is available does
  not reserve it. Revalidate at the owning operation when an earlier observation
  may be stale. If the invariant must hold throughout the action, protect the
  check-and-act interval with the required ownership or synchronization.
- **Waiting versus execution:** dropping a waiting future does not establish that
  submitted work stopped. In particular, started blocking work may continue.
  Define who retains its resources and disposes of an unused result.
- **Dropping versus asynchronous cleanup:** dropping a value does not by itself
  await shutdown. Give required asynchronous completion an explicit owner.
- **Acquisition versus installation:** when cancellation must prevent replacement,
  keep resource acquisition distinct from the point that installs it. Define who
  cleans up an acquired but unused resource.

Do not retain a guard through work unrelated to the invariant it protects.
Required coordination may span an await, worker handoff, or user interaction;
explain that lifetime and choose an appropriate mechanism. Do not occupy blocking
workers merely to wait for access that can be awaited before submission.

Failure reporting follows the [error-handling guidance](../architecture/error-handling.md).
Encapsulation must preserve its promised outcomes, including independent
operation and cleanup failures. It must not replace them with silent disposal.

## 5. Define queue, retry, and shutdown policies explicitly

### Rule

Introducing machinery also introduces behavior. Its owner must define the
policies that affect callers; library defaults are not a substitute for that
decision.

| Mechanism       | Contract the owner must establish                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Queue           | Capacity or growth policy, ordering guarantees, full/closed behavior, and ownership of abandoned work.                                     |
| Retry           | Retryable failures, whether repetition can duplicate effects, attempt limit and any applicable timing policy, and final failure reporting. |
| Background work | Who observes completion, owns resources, and handles failure after the initiating caller leaves.                                           |
| Shutdown        | When admission ends, what happens to outstanding work, and what completion guarantees the caller receives.                                 |

Do not add automatic retries to compensate for unclear ownership or a caller's
uncertain result. A lost reply may follow a completed side effect. Permitting a
later explicit attempt and automatically replaying an operation are different
contracts. Reuse the existing [error-handling guidance](../architecture/error-handling.md)
for recovery and reporting rather than inventing another error framework.

## 6. Use precise terminology

| Term                     | Meaning                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| Lock / guard             | A synchronization mechanism and the value retaining the granted access.                  |
| Semaphore permit         | Admission ownership for bounded concurrent activity.                                     |
| `RefCell` borrow guard   | Runtime borrow checking; not a thread-synchronization lock.                              |
| `.await`                 | Awaiting a future; it is not itself a lock or a new task.                                |
| Blocking-work submission | Scheduling synchronous work; coordination must be established separately where required. |
| Preflight check          | A preliminary observation; it does not make a later action atomic.                       |

Apply [operation-structure guidance](../rust/operation-structure.md#preserve-execution-and-ownership)
when naming guards or extracting expressions. A named local can change a
lifetime; clearer spelling alone does not prove equivalent coordination.

## Review and evidence

Review these questions for the mechanism being introduced or changed:

1. Which concrete requirement prevents direct execution or simpler ownership?
2. Can the caller request one meaningful operation without reconstructing the
   coordination protocol?
3. Does the owner retain each guard, permit, and resource for its required
   lifetime, including abandonment and shutdown?
4. Are queueing, retry, and failure policies explicit where those features exist?
5. Does reuse eliminate repeated responsibility without creating an unrelated
   general framework?

Validate changed guarantees using focused existing scenarios where possible.
Use the [testing policy](../architecture/testing-policy.md) for any added evidence:
test our ownership and lifecycle behavior, not the standard library's mutex or
channel implementation. A new abstraction alone does not justify new tests.

For new code, select the required ownership before choosing machinery. For
existing code, removing or relocating machinery requires evidence that the
protected invariant and its full lifetime remain satisfied.
