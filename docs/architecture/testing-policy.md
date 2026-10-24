# Testing policy

## 1. Purpose

The test suite should provide useful evidence about the application with a small,
understandable maintenance burden.

Retain tests for:

1. Meaningful workflow rules implemented by the application.
2. Nontrivial low-level operations implemented by our code.
3. Integration boundaries where adaptation can change or lose information.
4. Ownership and lifecycle behavior that our code actively manages.

Avoid tests that primarily repeat:

- Dependency guarantees.
- Ordinary language behavior.
- Straightforward field forwarding.
- Standard-library or operating-system behavior.
- Existing coverage at another layer.
- Historical implementation details that no longer exist.

A test does not earn its place merely because it executes production code,
increases coverage, or checks behavior that matters somewhere in the system.

**It must establish something meaningful about our implementation.**

This policy applies to new tests, reviews of existing tests, and cleanup during
refactoring.

## 2. The ownership rule

Before adding or retaining a test, identify who implements the behavior.

| Owner | Testing approach |
| --- | --- |
| Our application or library | Test meaningful rules, transformations and lifecycle decisions. |
| A dependency | Rely on its coverage for internal behavior. Test our integration where it introduces a meaningful adaptation. |
| Rust or the standard library | Do not test ordinary language semantics or direct forwarding to standard-library operations. |
| The operating system | Do not reproduce general filesystem or platform conformance tests. |
| Another layer in the repository | Prefer coverage at the actual owner. Avoid repeating the same rule through several wrappers. |
| Test-only machinery | Do not treat the machinery's behavior as evidence about production code. |

The central question is:

> **What does our code contribute between the input and the result?**

If the answer is only "calls the library and forwards its result," a separate
test usually adds little value.

Upstream coverage does not prove that our integration is correct. Conversely,
using a dependency does not justify retesting everything it does.

## 3. What qualifies for testing

### 3.1 Our workflow rules

A workflow test can be valuable when our implementation chooses between actions,
combines results, or preserves state according to an application rule.

Examples include:

- Replacing a retained resource only after successful acquisition.
- Rejecting an acquisition that finishes after its owner has shut down.
- Applying a result only while the owning view still accepts that operation.
- Coordinating steps whose independent results affect the application differently.

These examples do **not** require a test at every layer.

Picker dismissal, retained selection and subsequent operations should not be
repeatedly simulated in the service, operations client, component and frontend
merely because the behavior passes through them.

Prefer the smallest existing test at the layer that owns the rule. Add another
boundary test only when it proves an additional integration property.

**Important production behavior does not automatically require multiple tests of
the same behavior.**

### 3.2 Our low-level operations

Low-level unit tests are useful when they exercise actual logic implemented by
our code.

Examples include:

- Splitting a large logical read into smaller protocol requests.
- Calculating offsets or ranges where our code performs nontrivial translation.
- Enforcing application-owned protocol validation rules.
- Preserving partial progress while handling a subsequent acquisition failure.
- Selecting an acquisition error over a less informative parser error.

Focus the test on our transformation or decision.

Do not expand it into a test of the underlying reader, parser, serializer or
operating system.

### 3.3 Meaningful integration boundaries

A boundary test is justified when two individually correct parts can be connected
incorrectly.

Examples include:

- Our read adapter satisfying the requests made by `object`.
- A generated component binding carrying the intended result representation.
- Rust execution and native dialog processing cooperating correctly.
- A source failure surviving an upstream API that exposes a different error representation.

Identify the specific integration risk.

The presence of two libraries or layers is not sufficient justification by itself.

### 3.4 Custom ownership and lifecycle behavior

Test ownership where our implementation actively coordinates it.

Examples include:

- Preventing a late acquisition from being installed after shutdown.
- Preventing delayed initialization from creating resources after its owner ends.
- Releasing resources through custom coordination.
- Maintaining an explicit relationship between an owner and its retained resources.

Distinguish these cases from ordinary destruction.

Dropping a struct that contains a `File` normally drops that `File`. Demonstrating
this does not test a custom lifecycle mechanism.

## 4. What should not be tested

### 4.1 Upstream parsing and interpretation

Libraries such as `object` own binary-format decoding and the upstream names and
representations consumed by the application.

Do not maintain broad tests for:

- Canonical Mach-O names.
- Header constants and CPU identifiers.
- Packed-version decoding performed by `object`.
- Ordinary load-command traversal.
- Continuing past an unknown command when our branch performs no work.
- Several command variants reaching the same forwarding branch.
- Malformed inputs whose rejection comes entirely from upstream parsing.

A report test that only verifies direct assignments from upstream values usually
adds little evidence.

A test becomes relevant when our code performs a meaningful transformation,
imposes a rule, or adapts input in a way that can affect interpretation.

### 4.2 Standard-library and operating-system behavior

Avoid tests whose principal result is that an operating-system or standard-library
operation works as documented.

Examples include:

- Positional reads preserving the shared file cursor.
- High offsets working when passed directly through without narrowing.
- Sparse-file holes returning zero bytes.
- A file handle closing through ordinary field destruction.
- Repeated comparisons of forwarded OS error codes.

External file changes also do not justify tests by themselves. Examples include:

- Same-size modifications after selection.
- Truncating a selected file and then invoking analysis.
- Renaming or replacing paths outside the operation being tested.

Such scenarios need a distinct application-owned rule to justify their inclusion.
Merely observing the filesystem's response is insufficient.

Excluding a scenario from the suite does not require removing its production
handling.

### 4.3 Serialization mechanics

Do not maintain tests merely to demonstrate serializer behavior.

Examples include:

- Integer extrema surviving a Rust-to-Rust round trip.
- Reordered named fields remaining decodable.
- Synthetic enum definitions demonstrating named-field serialization.
- Deeply nested unknown fields exercising a dependency's configured depth mechanism.
- Basic JSON snapshots that mirror straightforward serialization.

A successful round trip alone is weak evidence.

Serialization tests should establish an application-owned contract or a meaningful
boundary condition. They should not become a conformance suite for Serde or its
format implementations.

### 4.4 Ordinary control flow

Do not test Rust's `?`, simple early returns, or direct error mapping as independent
behavior.

Examples include:

- An invalid request returns before the next function call.
- A metadata error prevents a later content read.
- A closed channel produces the directly mapped error.
- A write failure prevents the subsequent flush.
- A wrapper exposes the error it was given.

Call-order assertions are useful only when the order expresses a meaningful rule
implemented by our code.

### 4.5 Trivial report construction

Avoid tests that check only that:

- Each input item was pushed into a vector.
- Two pushed items retain their input order.
- A forwarded value appears in the corresponding output field.
- Empty inputs produce empty collections.
- A simple wrapper contains its supplied value.

These checks do not automatically become valuable because the resulting structure
is public.

### 4.6 Historical absence

Do not keep deleted concepts alive in tests solely to assert that they remain
absent.

Examples include:

- Checking that removed API names are no longer exported.
- Inputs chosen specifically to exceed a deleted quota.
- Delays chosen specifically to outlast a removed timeout.
- Tests documenting that former parser or cache policies no longer apply.

Tests and comments should describe the current contract.

They should not serve as a permanent record of abandoned implementations.

### 4.7 Dependency timing

Do not test a provider's timer simply because the application configures its
duration.

For example, retaining a connection timeout configuration does not require a test
that waits for that timeout to expire.

Avoid artificial waits that primarily exercise:

- A dependency's timeout.
- An old deadline.
- Scheduler timing.
- A previously removed policy.

A timing test needs a concrete timing rule owned by our code. Its assertions must
distinguish that rule from incidental machine or scheduler behavior.

### 4.8 Automatic test expansion

Do not add tests simply because:

- A function was introduced.
- A helper was extracted.
- A field or module was renamed.
- A type is reused directly.
- A conversion branch was deleted.
- A comment was improved.
- A coverage report shows an uncovered line.

A reversible structural refactor often needs compilation, existing tests and
applicable boundary validation rather than new test cases.

## 5. Duplicate coverage

One meaningful test at the right owner is preferable to several larger tests that
repeat it through different layers.

Compare the claims of similar tests.

| Situation | Decision |
| --- | --- |
| Both assert the same rule through different wrappers | Prefer the test at the actual owner. |
| One tests the rule and another tests a real boundary transformation | Both may be justified. |
| Several variants traverse the same branch with different synthetic values | Reduce or remove the matrix. |
| Assertions repeat facts already enforced by the fixture | Remove the redundant assertions and supporting machinery. |
| A filesystem test adds parsing unrelated to its claim | Remove the parsing dependency from the test. |

For example, a scripted transport that compares each request with the next
expected request does not also need to record every request so the outer test can
compare the same sequence again.

Do not preserve duplicate bookkeeping merely because it already exists.

## 6. Comparing input paths

Comparing two paths can be useful, but equality alone does not establish
correctness.

When both paths:

- Use the same parser.
- Use the same report conversion.
- Receive equivalent synthetic input.

...matching results can reproduce the same mistake.

Avoid broad resident/source parity coverage that mainly demonstrates that both
paths reach the same upstream interpretation.

A comparison needs an independent expectation about our adaptation, such as a
specific range calculation or error-precedence rule.

Avoid matrices of malformed examples where both paths simply return upstream
failures.

Do not retain a generic parity helper whose main purpose is accepting any pair of
matching successes or failures.

## 7. Test doubles and fixtures

### 7.1 Production behavior must remain the subject

A synthetic source, transport or provider is a test instrument. It is not
production coverage by itself.

Warning signs include:

- A large test-only implementation.
- Custom state machines supporting one simple test.
- Region maps and offset translation created only for a synthetic fixture.
- Request recording that duplicates existing assertions.
- Counters, markers and custom error types without a distinct production claim.
- Handwritten implementations that reproduce the production behavior being tested.

A test double is appropriate when it is the smallest practical way to exercise a
meaningful production rule.

Its complexity must remain proportionate to that rule.

### 7.2 Use ordinary data for unrelated operations

Filesystem tests should usually use ordinary bytes.

Opening a directory entry does not require analyzing its contents. Retaining a
file does not require a Mach-O fixture. A `.app` directory name does not make
binary inspection part of a navigation test.

Use binary fixtures when interpretation or an actual parser integration is the
subject.

### 7.3 Prefer representative inputs

Avoid maintaining large fixture matrices without distinct behavioral claims.

For parser integration, upstream assets can provide representative inputs without
introducing handwritten binary-format generators. Use the established
fixture-acquisition mechanism where appropriate.

The availability of upstream fixtures does not justify testing every fixture.

Choose fixture storage and acquisition according to practical needs:

- Reliability.
- Availability.
- Execution time.
- Reproducibility.
- Maintenance cost.

Do not introduce another acquisition mechanism speculatively.

### 7.4 Remove abandoned support code

When removing a test, remove support used exclusively by that test:

- Helpers and fixtures.
- Custom errors and markers.
- Shared counters.
- Recording collections.
- Imports.
- Test-only dependencies.
- Documentation that no longer describes a retained contract.

Check for other consumers first.

A test removal is incomplete when its supporting machinery remains without a
purpose.

## 8. Error handling tests

### 8.1 Preserve evidence where our code can lose it

A representative test can be valuable at a boundary where an original acquisition
failure might be:

- Replaced by a parser error.
- Reduced to an uninformative result.
- Lost while recovering the underlying reader or cache.
- Incorrectly superseded by another failure.

The claim should concern that preservation decision.

### 8.2 Do not repeat error chains across layers

Avoid repeated tests of:

- Fixed numbers of `.source()` links.
- Pointer identity of an error object.
- Identical downcasts at several wrappers.
- Synthetic marker values.
- Every acquisition-error variant traversing the same branch.
- Direct copying of an error field.
- Exact upstream parser request sizes.

Prefer one representative check at the boundary that can actually lose
information.

Do not introduce a handwritten error type merely to make a trivial forwarding
assertion possible.

### 8.3 Respect consumer boundaries

Ordinary Rust callers may need typed causes. A presentation boundary may
intentionally expose a smaller Rust-defined message or result.

Test the intended contract of that boundary.

Do not require the frontend to understand internal transport classifications,
operating-system codes or parser implementation details merely because those
details exist internally.

Rust-defined messages should not be duplicated as frontend-owned error
interpretation.

### 8.4 Distinguish dismissal from operational failure

Normal dialog dismissal, an abandoned request and service shutdown represent
different situations.

A test must identify the relevant owner and behavior.

Do not create a broad cancellation matrix across every layer. Prefer the smallest
existing coverage of the relevant rule, and do not preserve obsolete
classifications in fixtures or expectations.

## 9. Native dialogs, asynchronous work and frontend behavior

### 9.1 Separate visible behavior from internal scheduling

Assert an observable contract rather than an arbitrary scheduling sequence.

Avoid pinning:

- Incidental callback order.
- Exact pending-state durations.
- Render counts without a demonstrated requirement.
- Temporary dependency implementation details.
- A parser's particular read-request schedule.

Where asynchronous coordination matters, identify the owned guarantee—for
example, whether a late result can update a view whose operation has ended.

### 9.2 Test the integration that can actually fail

A native-dialog test must distinguish receiving a picker result from completing
native dismissal.

A browser-only stub cannot establish that a native panel closes correctly.

A native-loop test cannot establish that the full browser-to-service path works.

Choose the smallest level that can observe the specific failure. Do not describe
a test as end-to-end when it substitutes the boundary being investigated.

### 9.3 Separate investigation from permanent coverage

Temporary probes can isolate a difficult problem without becoming permanent test
infrastructure.

Retain a permanent test only when it is:

- Relevant to our implementation.
- Repeatable.
- Able to observe the actual failure.
- Maintainable without disproportionate platform machinery.

Document manual evidence accurately. Do not claim automated verification when a
scenario still depends on user interaction.

## 10. Test names must match their evidence

Names and comments must describe what a test actually observes.

| Claim | Insufficient evidence |
| --- | --- |
| Recovery after failure | Constructing a new session after the failed operation. |
| Cache release | Observing that another inspection performs reads again. |
| Dispatched work retains a lock | Acquiring the lock directly inside the test. |
| Custom resource cleanup | Observing ordinary Rust field destruction. |
| Correct parsing | Comparing reports produced through the same interpretation. |
| Correct workflow ordering | Repeating an order already enforced by the scripted fixture. |

When a test overclaims, make the evidence meaningful or remove the test.

Renaming alone does not rescue a test with no useful remaining claim.

## 11. Review decisions

Use these categories when reviewing tests:

| Decision | Meaning |
| --- | --- |
| **Keep** | Tests a meaningful owned rule, operation, boundary or lifecycle. |
| **Simplify** | The claim is useful, but fixtures or assertions add unnecessary complexity. |
| **Remove** | Primarily tests upstream behavior, trivial forwarding, duplication or obsolete implementation details. |
| **Investigate** | Ownership or unique value is unresolved. Retain temporarily with a specific review note. |

An investigation note must identify the unresolved question.

Useful questions include:

- Does another test already own this behavior?
- Does the fixture reflect the production boundary?
- Does the assertion demonstrate the claimed property?
- Is the behavior implemented here or forwarded from a dependency?

Avoid vague TODOs that provide no direction.

Review file by file. Do not assume every test in a file has the same value.

## 12. Gate for new tests

Before adding a test, answer:

1. **What behavior does our code own?**
2. **What realistic implementation mistake would this test detect?**
3. **Which assertion demonstrates that mistake?**
4. **Does an existing test establish the same rule?**
5. **Is this the smallest appropriate layer?**
6. **Is the fixture cost proportionate to the evidence gained?**
7. **Would the test remain useful after a reasonable implementation refactor?**

If these answers are weak, improve an existing test or add no test.

Do not invent speculative failure scenarios solely to justify more coverage.

There is no required test count, coverage percentage or one-test-per-function
rule. A small suite with clear claims is preferable to a large suite with weak or
repeated claims.

## 13. Removing tests safely

Keep test removal focused.

1. Confirm the current filesystem content.
2. Identify the exact tests approved for removal.
3. Remove support code used exclusively by those tests.
4. Preserve production behavior unless a separate change is authorized.
5. Run the applicable retained checks required by the repository.
6. Verify that the resulting files match the intended patch.

Do not combine a test-removal request with unrelated production improvements.

Do not silently apply an older proposal or a larger combined diff.

When asked for a diff only, keep repository files unchanged.

Where concurrent editing or file restoration is a concern, verify the applied
result again after validation. A successful test run establishes what was executed
at that time; it does not establish that the source remained unchanged afterward.

## 14. Guiding principle

**Protect the decisions and adaptations implemented by our code.**

Keep tests that provide distinct evidence about meaningful behavior we own.

Remove tests whose principal contribution is repetition, incidental detail or
maintenance of their own scaffolding.
