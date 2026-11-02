# Operation structure

Use named intermediate values to make meaningful operations and their results
visible in execution order. This convention applies to production Rust and test
code. Rust permits nested expressions; separating them is a project readability
choice.

## Name operation results before using them

Separate resource acquisition, I/O, parsing, encoding, decoding, inspection, and
output conversion from the expressions that consume their results. Give the
result a descriptive name even when it is used only once. This applies whether
the next operation takes ownership of the value or borrows it.

For example, this expression combines opening a file and constructing a source:

```rust
let source = NativeFileSource::new(File::open(path)?)?;
```

Expose the two stages:

```rust
let opened_file = File::open(path)?;
let file_source = NativeFileSource::new(opened_file)?;
```

Use the same separation before matching a decoded value, appending an inspection
report to a collection, or serializing a converted output. A name should identify
what the operation produced, rather than merely replace nesting with `value`,
`data`, or `result`.

Distinguish the operation's result from its successful value. For example,
`read_result` can contain success or failure; `returned_bytes` names the bytes
obtained after handling success. Likewise, keep a resource distinct from its
identifier and a lock distinct from the guard holding it.

## Separate conversion from branching

Name a checked conversion's result before branching on it. Name the converted
value by its role, and explain any non-obvious fallback beside the branch that
implements it.

Follow [Integer types and conversions](integer-types.md#conversions-and-validation)
for integer domains, explicit `match`, and failure handling. Expression cleanup
must not invent a new conversion policy or duplicate validation at another layer.

## Execute test operations before verifying results

Complete the operation under test before asserting its outcome:

```rust
let dismissal_response = handler.dispatch(request).await?;
assert_eq!(dismissal_response, expected_dismissal);
```

Prepare responses, encoded messages, and other meaningful setup values before
passing them into subsequent setup operations. When a case table verifies
previously obtained outcomes, obtain and name those outcomes before building the
table. When the table contains inputs, execute the operation explicitly in the
loop before verifying its result.

Follow the [testing policy](../architecture/testing-policy.md#10-test-structure-naming-and-documentation)
for scenario scope, variable names, error expectations, numbered comments, and
cleanup. Do not add tests solely to protect expression layout or renamed locals.

## Preserve execution and ownership

Review these properties when extracting expressions:

1. **Order and frequency.** Keep dependent operations in the same order and
   execute each operation the same number of times.
2. **Failure and cleanup.** Preserve error propagation, diagnostic precedence,
   transport reset, and task cleanup. An early `?` must not bypass work that the
   original failure path performed.
3. **Borrow and resource lifetimes.** Named locals can outlive the temporaries
   they replace. Keep required locks held, and release guards before operations
   that previously ran after their release. Prefer naming an owned outcome over
   unnecessarily retaining a `RefMut` guard during output conversion.
4. **Behavior and evidence.** Keep read bounds, partial progress, state changes,
   fixtures, and assertions unchanged in a readability-only change. Review any
   intended behavioral change separately.

## Keep simple expressions concise

Simple getters, predicates, indexing, `Some` and `Ok` wrappers, and ordinary `?`
propagation do not each require an intermediate variable. Assertions may inspect
an already obtained result through expressions such as `is_err()` or `len()`.
Required runtime callbacks also remain callbacks.

The useful distinction is whether an expression performs a meaningful operation
or merely inspects or wraps a value already obtained. Use names to expose the
former without mechanically expanding every expression.
