import { type GenericFunction } from '../types-generic';

/**
 * Type for the object returned by the debounce function. It includes the
 * debounced function itself and a method to cancel pending executions.
 *
 * @template T The type of the original function being debounced, constrained to
 *             be a GenericFunction.
 */
export type DebouncedFunction<T extends GenericFunction> = {
  /**
   * Calls the original function after the debounce delay.
   * Accepts the same arguments as the original function.
   * Returns void because the actual result is delayed.
   */
  (...args: Parameters<T>): void;
  /**
   * Cancels any pending scheduled execution of the function.
   */
  cancel(): void;
};

/**
 * Creates a debounced function that delays invoking `func` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was
 * invoked. The debounced function comes with a `cancel` method to cancel
 * delayed `func` invocations.
 * Preserves the `this` context of the original function.
 *
 * --- Detailed Explanations ---
 *
 * [1] Explicit 'this' Parameter Typing (`this: ThisParameterType<T>`):
 *   - The `this:` syntax as the first parameter is a TypeScript compile-time feature
 *     to declare the expected type of `this` within the function.
 *   - `ThisParameterType<T>` is a utility type that extracts the required `this`
 *     type from the original function `T`. If `T` expects no specific `this`,
 *     it resolves to `unknown`.
 *   - Purpose: Ensures the captured runtime `this` (in `context`) is compatible
 *     with what the original function `func` expects, making the eventual
 *     `func.apply(context, ...)` call type-safe.
 *   - Example: If `T` is `(this: { name: string }, value: number) => void`, then
 *     `ThisParameterType<T>` is `{ name: string }`, ensuring the debounced
 *     function is called with a compatible `this`.
 *
 * [2] Generic Argument Capturing (`...args: Parameters<T>`):
 *   - `...args`: Standard JavaScript rest parameter syntax, gathering all passed
 *     arguments into an array named `args`.
 *   - `Parameters<T>`: A TypeScript utility type that extracts the parameter types
 *     of the original function `T` into an ordered tuple type.
 *   - Purpose: Ensures the `debounced` function accepts the exact same arguments
 *     (types and order) as the original function `func`. This allows the captured
 *     `args` array to be safely passed via `func.apply(..., args)`.
 *   - Example: If `T` is `(id: number, name: string) => void`, then `Parameters<T>`
 *     is `[id: number, name: string]`, ensuring `args` will be an array matching
 *     that structure.
 *
 * [3] 'this' Context Capturing (`const context = this`):
 *   - Inside a standard `function` expression, `this` refers to how the function
 *     was called at runtime.
 *   - This line captures that runtime `this` value into the `context` variable.
 *   - Purpose: Preserves the correct `this` context so it can be passed to the
 *     original function (`func`) when it's finally executed inside the `setTimeout`
 *     callback (where `this` would otherwise be different).
 *
 * [4] Calling the Original Function (`func.apply(context, args)`):
 *   - `apply` is a standard JavaScript method to call a function with a specified
 *     `this` value and arguments provided as an array.
 *   - `context`: Provides the `this` value (captured in [3]) for the execution of `func`.
 *   - `args`: Provides the arguments (captured in [2]) for the execution of `func`.
 *   - Purpose: Executes the original function `func` with the correct `this` context
 *     and arguments, just as if it had been called directly in that context.
 *
 * @template T The type of the function to debounce, constrained to be a GenericFunction.
 * @param func The function to debounce.
 * @param wait The number of milliseconds to delay.
 * @returns The new debounced function with a `cancel` method.
 */
export function debounce<T extends GenericFunction>(
  func: T,
  wait: number,
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Use a standard function expression to correctly capture `this`.
  // The signature uses TypeScript utility types explained in the main JSDoc.
  const debounced: DebouncedFunction<T> = function (
    // [1] Declare expected 'this' type, mirroring original function T.
    this: ThisParameterType<T>,
    // [2] Declare arguments signature, mirroring original function T.
    ...args: Parameters<T>
  ) {
    // [3] Capture the actual runtime 'this' context.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;

    // Clear any existing timer from previous calls
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    // Set a new timer
    timeoutId = setTimeout(() => {
      timeoutId = null; // Timer fired, clear ID

      // [4] Execute the original function with the captured context and
      // arguments.
      func.apply(context, args);
    }, wait);
  };

  // Method to cancel the scheduled invocation
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced;
}
