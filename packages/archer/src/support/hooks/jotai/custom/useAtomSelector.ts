import { useMemo } from 'react';
import { atom } from 'jotai';

import type { SelectorFunction } from './types';
import { useAtomValue } from 'jotai';

/**
 * A helper that reads a *derived* value from the Jotai store using a selector.
 * It builds a short-lived derived atom under the hood and returns its value.
 *
 * What it does
 * - Creates an atom: `atom(get => selector(get, param))`, memoized per
 *   component via `useMemo`.
 * - Jotai recomputes the selector only when the atoms read inside it change.
 * - On unmount, the derived atom is discarded (no global state left behind).
 *
 * Scope & caching
 * - Each caller gets its **own** derived atom; values are **not shared across components**.
 * - If many components need the same derived value or the computation is heavy,
 *   prefer a **module-level derived atom** and read it with `useAtomValue` so
 *   the result is computed once per store update.
 *
 *   Examples — two scoping patterns
 *   A) Per-component (this hook):
 *     // keep object params stable to avoid rebuilding
 *     const params = useMemo(() => ({ timelineId, postId, sliceId: 'comments' }), [timelineId, postId]);
 *     const viewsToRender = useAtomSelector(viewsToRenderSelectorFunction);
 *     const byViewId = useAtomSelector(viewElementByViewIdSelectorFunction);
 *     const ve = byViewId.get(view.id);
 *
 *   B) Store-cached (shared across components):
 *     // module (once)
 *     export const viewsToRenderAtom = atom(get => {
 *       const { isMobile } = get(appCompositionState);
 *       const { views } = get(navigationStateAtom);
 *       const viewsToRender = get(viewsToRenderSelector);
 *       return isMobile ? views : viewsToRender;
 *     });
 *     export const viewElementByViewIdAtom = atom(get => {
 *       const { viewElements } = get(navigationStateAtom);
 *       const m = new Map<TView['id'], TViewElement>();
 *       for (const ve of viewElements) if (ve.parentId != null) m.set(ve.parentId, ve);
 *       return m;
 *     });
 *     // component
 *     const viewsToRender = useAtomValue(viewsToRenderAtom);
 *     const byViewId = useAtomValue(viewElementByViewIdAtom);
 *     const ve = byViewId.get(view.id);
 *
 * Param stability
 * - `useMemo` keys off `[selector, param]` using `Object.is`:
 *   primitives compare by value; objects compare by reference.
 * - If `param` is an object, a new reference (even with identical contents)
 *   will rebuild the derived atom and may trigger unnecessary
 *   recomputation/renders.
 * - Keep object params **stable**—e.g. memoize them with `useMemo` or your own
 *   shallow memo—to avoid rebuilding when the meaningful fields haven’t
 *   changed.
 *
 * Best practices
 * - Define `selector` at **module scope** so its identity is stable.
 * - For object `param`, memoize from the *primitive* pieces you care about.
 * - If the selector is expensive and widely used, promote it to a module-level atom.
 *
 * Example (stabilizing an object param)
 *   const stableParams = useMemo(
 *     () => ({ timelineId, postId, sliceId: 'comments' }),
 *     [timelineId, postId]
 *   );
 *   const ref = useAtomSelector(refPostSliceScrollSelectorFunction, stableParams);
 *
 * Limitations
 * - Because each component owns its derived atom, multiple components using the
 *   same selector will each recompute on updates. Use a shared derived atom to
 *   avoid this.
 */
export const useAtomSelector = <T, P>(
  selector: SelectorFunction<T, P>,
  param: P,
): T =>
  useAtomValue(
    useMemo(() => atom((get) => selector(get, param)), [selector, param]),
  );
