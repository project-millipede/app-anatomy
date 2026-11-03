# TypeScript implementation practices

These requirements apply to new TypeScript code, changes, and reviews. They build
on the [shared development guidelines](../development/README.md). Examples below
illustrate language and presentation decisions; they do not introduce application
APIs or authorize moving Rust behavior into TypeScript.

## 1. Keep responsibilities within the permitted boundary

1. Use TypeScript for presentation, UI lifecycle, necessary environment bindings,
   and repository build tooling. Keep analysis, filesystem protocol, and reusable
   non-UI workflow semantics in their ordinary Rust owners.
2. Reuse generated component contracts directly. Derive presentation types from
   those contracts where needed; do not maintain a parallel operation API or
   reproduce Rust validation and workflow decisions in frontend helpers.
3. Document why a host binding is necessary and what it adapts. Keep its platform
   behavior separate from reusable application semantics.

The [Rust execution-boundary contract](../architecture/rust-runtime-independence/README.md)
and [API design guidance](../development/api-and-workflow-design.md) own these
decisions. A convenient JavaScript library does not change those boundaries.

## 2. Preserve strict checking and validate actual boundaries

1. Preserve the owning package's strict compiler configuration. `strict` enables
   a family of checks; it is not a claim that all optional safety flags are
   enabled. See the [TypeScript strict reference](https://www.typescriptlang.org/tsconfig/strict.html).
2. Read the applicable `tsconfig.json`. The repository's scripts enable
   `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; other packages do
   not necessarily enable them. Do not assume a lookup exists merely because its
   inferred type omits `undefined`, or change compiler options during unrelated
   work. See [indexed access checking](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html).
3. Treat genuinely untyped external values as `unknown`, then check the shape and
   values the boundary requires. Reuse the existing validator when one owns that
   boundary. Do not wrap every trusted generated call in another validation layer.
4. Avoid `any`, type assertions, and non-null assertions as substitutes for
   necessary checks. Assertions do not inspect or convert runtime values. A
   necessary ABI assertion must stay narrow and explain the invariant established
   by the binding contract. See [type assertions](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions).

For example, this illustrative host input accepts only a text label:

```ts
function readDisplayLabel(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Display label must be text');
  }

  return value;
}
```

The check establishes the type; `value as string` would only silence the
compiler. Do not infer stronger guarantees, such as a nonempty label, without
checking them when the actual contract requires them. See [unknown values](https://www.typescriptlang.org/docs/handbook/2/functions.html#unknown).

## 3. Model absence and states accurately

1. Distinguish an omitted property, a present `undefined`, and an explicit `null`
   when the API gives them different meanings. Optional properties are not a
   general substitute for modeling distinct states. The
   [exact optional property setting](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)
   documents how omission differs from assigning `undefined`.
2. Apply a fallback only when it is the intended behavior. For example, a missing
   optional caption may have a display default; a missing required resource
   identifier must not become an empty identifier. Check absence explicitly when
   empty strings, zero, or `false` remain valid values.
3. Prefer discriminated unions for mutually exclusive states with different
   payloads. Handle each relevant variant; use an exhaustive `never` check when
   extending a closed union must force callers to reconsider their handling.
   See [narrowing and exhaustiveness](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking).

Illustrative presentation state:

```ts
type PreviewState =
  | { kind: 'empty' }
  | { kind: 'ready'; title: string }
  | { kind: 'failed'; message: string };

function previewCaption(state: PreviewState): string {
  switch (state.kind) {
    case 'empty':
      return 'No preview';
    case 'ready':
      return state.title;
    case 'failed':
      return state.message;
    default: {
      const unexpectedState: never = state;
      throw new Error(`Unexpected preview state: ${unexpectedState}`);
    }
  }
}
```

This prevents a statically constructed `ready` state without a title. It does not
validate external data. Prefer an existing generated union when it already
expresses the states needed by the presentation.

## 4. Make mutation and ownership deliberate

1. Prefer `const` for bindings that are not reassigned. Use `let` when reassignment
   expresses the algorithm clearly; do not replace a simple loop with an opaque
   expression solely to avoid it.
2. Accept readonly collections and properties when callers should retain control
   over mutation. `readonly` is a compile-time restriction, is not recursively
   immutable, and does not freeze an object at runtime. See [readonly properties](https://www.typescriptlang.org/docs/handbook/2/objects.html#readonly-properties).
3. Keep necessary mutation inside its owner. Avoid mutating caller-owned objects
   unexpectedly. Local construction with mutation is appropriate when the result
   is not yet shared; copying everything is not a universal safety requirement.

Choose ownership before adding caches, shared stores, locks, or queues. Follow
[infrastructure and ownership](../development/infrastructure-and-ownership.md).

## 5. Keep functions, types, and modules purposeful

1. Name values by their role and units. Separate meaningful operations from their
   consumption when nesting conceals execution, failure, or ownership. Use a
   named result before an assertion; do not hide the tested operation inside it.
2. Give public boundaries clear signatures; allow normal inference for obvious
   local values and callbacks. Do not repeat a generated type's fields merely to
   annotate a variable. TypeScript supports inference without annotating every
   declaration. See [type inference](https://www.typescriptlang.org/docs/handbook/type-inference.html).
3. Introduce a helper, generic, or module for a coherent responsibility or useful
   reuse. Prefer a direct function over a configurable callback framework for one
   case. Keep implementations private unless consumers need them.
4. Keep imports and dependencies aligned with the owning package and its module
   configuration. Use type-only imports for type-only dependencies where required;
   avoid introducing module-load side effects as hidden initialization.

The [simplicity guideline](../development/implementation-simplicity.md) owns the
abstraction decision. These rules do not ban ordinary closures, inference, or
expressions that remain easy to follow.

## 6. Own asynchronous work and its failures

1. Await a promise, return it to the caller, or give its completion and rejection
   an explicit owner. `void operation()` discards the expression's value; it does
   not handle rejection. Event handlers that start asynchronous work must route
   failures to the established reporting boundary.
2. Catch errors where recovery, meaningful context, or reporting belongs. Narrow
   unknown caught values before accessing properties. Do not convert failure into
   an empty successful result or merely log it when the caller needs the outcome.
3. Start operations together only when their dependencies and owner permit it.
   If an input rejects, `Promise.all` rejects with the first observed rejection
   reason; it does not collect all failures. Use `Promise.allSettled` when all
   independent outcomes are required, then inspect those outcomes. See the
   [ECMAScript promise combinators](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.all).
4. Do not confuse a rejected combined promise, an ignored result, or a timeout
   race with cancellation. Promises have no built-in abort mechanism. An
   `AbortSignal` is useful only when the receiving API supports it and acts on it.
   See the [DOM abort contract](https://dom.spec.whatwg.org/#aborting-ongoing-activities).
5. Keep cleanup with the resource owner on success and failure. If cleanup can
   fail, apply the declared policy for both operation and cleanup failures; do not
   accidentally replace one with the other. Follow [error handling](../architecture/error-handling.md).

These language mechanisms do not authorize adding cancellation, retries, or
background work to the inspection workflow. Preserve its existing runtime
contract and Rust-owned operation semantics.

## 7. Keep React rendering pure and lifecycle ownership stable

1. Calculate JSX from props and state without starting I/O or modifying existing
   shared values during render. Keep user-triggered work in event handlers.
   See [React component purity](https://react.dev/learn/keeping-components-pure).
2. Derive values from existing props or state during rendering when practical.
   Avoid a second state value and an Effect merely to keep that derivation in
   sync. Add memoization for a demonstrated need, not as a default wrapper.
   See [when an Effect is unnecessary](https://react.dev/learn/you-might-not-need-an-effect).
3. Use Effects to synchronize with external systems. Declare their dependencies
   accurately and pair setup with the required cleanup, such as removing the
   listener that was installed. Account for stale asynchronous results where
   relevant; ignoring one does not cancel its underlying operation. See
   [Effect synchronization and cleanup](https://react.dev/learn/synchronizing-with-effects).
4. Preserve the application's existing runtime and model owners. Presentation
   variants receive the model; they must not create additional runtimes, duplicate
   domain state, or make resource lifetime depend on the selected presentation.
   Follow the [runtime lifecycle](../architecture/system-overview.md#runtime-lifecycle).
5. Prefer semantic HTML and the project's established UI primitives. Supply
   accessible names, keyboard behavior, and focus handling appropriate to the
   control. Adding an ARIA role alone does not supply its interaction behavior.
   See the [WAI guidance on role semantics](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/).

## 8. Review behavior, not just successful compilation

1. Check required and absent inputs, failure reporting, ownership, and relevant
   asynchronous races for the behavior changed. Compiler acceptance does not
   establish external input validity or lifecycle correctness.
2. Run the existing checks appropriate to the affected package and follow the
   [testing policy](../architecture/testing-policy.md). Tests should demonstrate
   application-owned behavior, not reproduce TypeScript or React guarantees.
3. Keep improvements within the requested scope. An unrelated assertion, module
   pattern, or compiler-option difference is a separate candidate, not permission
   for a repository-wide migration.
