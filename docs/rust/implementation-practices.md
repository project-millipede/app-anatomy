# Rust implementation practices

Use these practices for new and revised Rust code across libraries, clients,
services, and adapters. They complement the [development guidelines](../development/README.md).
Apply them within the task's scope; they do not authorize unrelated migrations.

Language facts describe Rust guarantees or standard-library behavior. **Defaults**
permit justified exceptions. **Repository requirements** come from the linked
owning policies and remain binding. Explain the concrete need for an exception.

## 1. Make ownership intentional

**Default:** borrow when inspecting a value, borrow mutably when modifying a
caller-owned value, and take ownership when the operation must retain or consume
it. Rust references borrow without transferring ownership and must remain valid
for their use. [Rust Book: borrowing](https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html)

Prefer `&str`, `&[T]`, and `&Path` when only those views are required. Accept an
owned `String`, `Vec<T>`, or `PathBuf` when ownership is part of the contract;
do not borrow and silently clone an input that the caller could have moved.
This follows [Rust API Guidelines: caller control](https://rust-lang.github.io/api-guidelines/flexibility.html).

Cloning is appropriate for an independent snapshot or intentional shared handle.
Identify which it is: cloning a reference-counted pointer shares its allocation;
it does not copy the underlying object. [Standard library: `Rc`](https://doc.rust-lang.org/std/rc/index.html)
Do not add cloning, allocation, or shared ownership merely to silence a borrow
error before checking whether the operation and owner can be expressed directly.

**Limit:** borrowing is not universally cheaper or simpler. An owned result can
avoid coupling caller lifetimes to internal state. Keep a borrowed result when
its lifetime and avoided copying are useful parts of the API.

## 2. Represent states and invariants in types

**Default:** choose the representation that expresses the actual contract.

| Meaning                                   | Representation                                  |
| ----------------------------------------- | ----------------------------------------------- |
| Ordinary absence                          | `Option<T>`                                     |
| A fallible operation with a diagnostic    | `Result<T, E>`                                  |
| Distinct alternatives with different data | An enum with data on the relevant variants      |
| Values that must not be confused          | A focused newtype with appropriate construction |

For example, when `Connecting`, `Connected(Handle)`, and `Closed` permit different
operations, an enum is clearer than unrelated booleans and optional fields.
Use private fields and validated construction when callers must not bypass an
invariant. Newtypes can distinguish otherwise interchangeable representations.
[Rust API Guidelines: type safety](https://rust-lang.github.io/api-guidelines/type-safety.html)

**Limit:** do not introduce wrappers for every local value. A plain struct or
`Option` is sufficient when it expresses all valid states clearly. Follow
[integer types and conversions](integer-types.md) for numeric domains. A newtype
must enforce any promised validity through its construction and operations.

## 3. Keep APIs small and capabilities explicit

**Default:** accept the capabilities the operation needs and expose the results
the caller needs. Keep implementation details private; use `pub(crate)` or a
narrower visibility when external callers do not need the item.

```rust
// Read-only byte access does not require ownership of a vector.
fn inspect_bytes(bytes: &[u8]) -> Result<Report, InspectionError>;

// Retaining a resource makes ownership transfer part of the API.
fn install_source(&mut self, source: NativeFileSource) -> Result<Selection, Error>;
```

These signatures illustrate ownership, not additional repository APIs. Prefer
existing standard or domain traits when they express a real capability. Add a
trait for a genuine implementation boundary or reusable contract, not solely to
mock a private helper. Choose generics when compile-time variation is useful and
`dyn Trait` when runtime polymorphism or type erasure is required; neither is a
mandatory layer around a concrete implementation.

**Repository requirement:** define reusable ordinary Rust behavior first. Keep
WIT, transport, runtime, and host-specific types at their established boundaries.
The complete non-UI workflow must remain usable through Rust libraries and
platform adapters. See [API and workflow design](../development/api-and-workflow-design.md)
and [Rust runtime independence](../architecture/rust-runtime-independence/README.md).

## 4. Return failures according to the operation's contract

**Default:** use `Result` for expected input, I/O, and environmental failures.
Use `?` to propagate through the enclosing function, closure, or async block;
match when recovering, translating errors, or completing required cleanup first.
Propagation does not roll back effects or cancel tasks.
[Rust Book: propagation](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html), [Rust Reference: async blocks](https://doc.rust-lang.org/reference/expressions/block-expr.html#async-blocks)

Keep typed causes where consumers need classification. Do not replace an error
with a default value, discard it with `.ok()`, or log it and continue unless that
behavior is the declared policy. Choose stopping, recovery, and aggregation under
the existing [error-handling guidance](../architecture/error-handling.md).

**Limit:** `unwrap`, `expect`, and assertions are legitimate for test failures and
proven programmer invariants. For routine fallible test setup, follow the
[testing policy](../architecture/testing-policy.md) preference for `Result` and `?`.
Use `expect` when its message explains why success must hold. External input is
not proof of an invariant. Document deliberate public panic conditions.
[Rust Book: choosing between panic and `Result`](https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html)

## 5. Make execution order visible

**Default:** use direct control flow for multi-step work, mutation, and cleanup;
iterators for clear transformations; closures for callbacks or focused computations.
Choose the form that makes the operation's meaning visible.

```rust
for source in sources {
    let inspection_result = inspect_source(source);
    inspection_results.push(inspection_result);
}
```

This example deliberately preserves each outcome. Replacing it with propagation
at the first failure would change its contract, not merely its style.

**Repository requirement:** name meaningful operation results before consuming
them, use role-specific names, and execute test operations before assertions.
Follow [operation structure](operation-structure.md) for the detailed rules and
the exceptions for simple expressions. Do not turn straightforward getters,
wrappers, or predicates into a sequence of redundant locals.

## 6. Own resource lifetimes and completion

**Default:** use owned values and guards for resource lifetime. Rust runs
destructors when values are dropped and drops their fields; most owners need no
custom `Drop` implementation. [Standard library: `Drop`](https://doc.rust-lang.org/std/ops/trait.Drop.html)
Do not add manual cleanup for resources already correctly owned by their fields.

Separate resource release from fallible or asynchronous completion. `Drop::drop`
does not return a `Result` or an awaitable operation. If the caller must observe a
flush, shutdown, or worker completion, expose and call or await that operation
and preserve its failure under the owning contract. Destructors are not a promise
that every external effect has finished successfully.

**Repository requirement:** required coordination and cleanup belong to the
cohesive resource owner. A direct async call does not itself justify a spawned
task; dropping a future is not proof that work it initiated has stopped. Follow
[infrastructure and ownership](../development/infrastructure-and-ownership.md)
for guard scope, cancellation, background work, and explicit shutdown guarantees.

## 7. Introduce sharing and synchronization for a concrete need

**Default:** begin with one owner and ordinary references. These mechanisms solve
different problems; do not add them together as an automatic recipe.

| Mechanism    | What it provides                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `Rc<T>`      | Shared ownership within a thread; reference counting is non-atomic.                                    |
| `Arc<T>`     | Shared ownership with atomic reference counting; sharing across threads still depends on `T`'s traits. |
| `RefCell<T>` | Interior mutability with runtime borrow checks; it is not thread synchronization.                      |
| `Mutex<T>`   | Exclusive guarded access; the standard mutex may block the calling thread while waiting.               |

See the standard documentation for [`Rc`](https://doc.rust-lang.org/std/rc/index.html),
[`Arc`](https://doc.rust-lang.org/std/sync/struct.Arc.html), [`RefCell`](https://doc.rust-lang.org/std/cell/index.html), and
[`Mutex`](https://doc.rust-lang.org/std/sync/struct.Mutex.html).
`Arc` does not make arbitrary inner data thread-safe. A `RefCell` borrow violation
can panic; interior mutability does not remove the borrowing rules.

**Limit:** appropriate sharing or synchronization is not a defect. Establish the
participants, protected invariant, and lifetime that require it. Encapsulate the
complete coordination operation at its owner instead of making application callers
reconstruct it. Low-level APIs may expose guards when caller-controlled access is
their intended contract. Use the infrastructure guide for choosing a mechanism;
do not replace locks with queues or tasks without reducing the actual complexity.

## 8. Keep unsafe code narrow and justified

**Repository requirement:** retain existing `forbid(unsafe_code)` restrictions;
this guidance does not authorize relaxing them.

**Default where permitted:** use safe Rust and qualified library APIs. Introduce
`unsafe` only for a concrete capability or demonstrated performance requirement
that safe alternatives cannot adequately meet. Rust's `unsafe` marks additional safety
obligations; it does not suspend the rules whose violation is undefined behavior.
[Rust Reference: unsafe obligations](https://doc.rust-lang.org/reference/unsafe-keyword.html)

For each unsafe operation, document why its specific preconditions hold: relevant
validity, bounds, alignment, aliasing, lifetimes, or external ownership. Keep the
unsafe region small, review the argument, and expose a safe wrapper only when it
can uphold those conditions for all allowed calls. Document caller obligations
on any public unsafe API. A successful test cannot establish soundness for all
inputs; unexplained `unsafe impl Send` or `Sync` is not a concurrency fix.

## 9. Qualify dependencies, features, and targets

**Default:** reuse an appropriate existing dependency before adding another or
reimplementing its responsibility. Check maintenance, API fit, license, supported
Rust version, target support, and enabled features. Avoid dependency upgrades or
new runtimes unrelated to the requested change.

Cargo features can combine across dependents; design additive features and inspect
the resolved graph when optional functionality matters. Disabling defaults in one
dependency declaration does not prove another path will not enable them.
[Cargo Book: features](https://doc.rust-lang.org/cargo/reference/features.html)

**Repository requirement:** keep platform dependencies in adapters and preserve
ordinary Rust execution independently of JavaScript and Wasm. Qualify the affected
native and component targets using existing build workflows. A host build alone
does not establish target compatibility; report unsupported or untested modes.

## 10. Document contracts and verify meaningful behavior

**Default:** public Rustdoc explains purpose, inputs, ownership, outputs, and
relevant errors, panics, or safety obligations. Include a focused usage example
when it clarifies the contract; link a shared example instead of duplicating it.
Prefer `?` in fallible examples intended for reuse.
[Rust API Guidelines: documentation](https://rust-lang.github.io/api-guidelines/documentation.html)

**Repository requirement:** follow the [testing policy](../architecture/testing-policy.md)
and existing validation commands. Reuse meaningful evidence; add or change tests
for affected production behavior, not automatically for every helper or language
feature. Keep fixture data and observed outcomes distinct from implementation
details and use the established test naming and comment structure.

Use existing formatting and lint checks. When using Clippy, evaluate suggestions
affecting ownership, behavior, or readability; explain narrow lint exceptions.
[Clippy: usage](https://doc.rust-lang.org/clippy/usage.html)
For broader design review, use [implementation simplicity](../development/implementation-simplicity.md).
