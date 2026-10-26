import { type RefObject } from 'react';

/**
 * Invalidates a cache stored within a React ref, operating immutably by always
 * creating a new cache object.
 *
 * This function supports two modes:
 * - Key-based Invalidation: Provide a `key` to remove a single entry.
 * - Full Invalidation: Omit the `key` to clear the entire cache.
 *
 * @param cacheRef The React ref (`RefObject`) holding the cache object.
 * @param key (Optional) The key of the entry to remove. If omitted, the entire
 *        cache object is cleared.
 */
export function invalidateCache<T extends object>(
  cacheRef: RefObject<T | null>,
  key?: keyof T,
) {
  if (key && cacheRef.current) {
    // Immutable Key-Based Invalidation
    const newCache = { ...cacheRef.current };
    delete newCache[key];
    cacheRef.current = newCache;
  } else {
    // Full Invalidation
    cacheRef.current = {} as T;
  }
}

/**
 * A "get-or-set" caching utility for React refs that intelligently handles
 * cache misses.
 *
 * Its primary feature is treating an `undefined` result from the `calculatorFn`
 * as a signal to not update the cache. This enables clean "guard clause"
 * patterns (e.g., `if (!condition) return;`) in the calculation logic without
 * creating unwanted side effects.
 *
 * @param cacheRef The React ref (`RefObject`) that holds the cache object.
 * @param key The key within the cache to get or set.
 * @param calculatorFn A function that computes the value if it's not cached. If
 *        it returns `undefined` (e.g., via a bare `return;`), the result is not
 *        stored.
 * @param forceRecalc (Optional) If `true`, bypasses the cache and forces the
 *        `calculatorFn` to run again. Defaults to `false`.
 * @returns The value from the cache or the result of the calculation. Returns
 *          `undefined` if the calculation is inconclusive and no previous value
 *          was cached.
 */
export function getFromCacheOrCalculate<T extends object, K extends keyof T>(
  cacheRef: RefObject<T | null>,
  key: K,
  calculatorFn: () => T[K],
  forceRecalc: boolean = false,
): T[K] {
  // 1. Return the cached value if it exists and recalculation isn't forced.
  if (!forceRecalc && cacheRef.current && cacheRef.current[key] !== undefined) {
    return cacheRef.current[key];
  }

  // 2. If no valid cache exists or recalculation is forced, run the function.
  const result = calculatorFn();

  // 3. Treat 'undefined' as a cache miss and do not store it.
  //    This is correct and intentional: a calculator function that uses a guard
  //    clause with a bare `return;` implicitly returns `undefined`.
  if (result === undefined) {
    return result;
  }

  // 4. The result is valid, so cache it immutably before returning.
  cacheRef.current = {
    ...(cacheRef.current || {}),
    [key]: result,
  } as T;

  return result;
}
