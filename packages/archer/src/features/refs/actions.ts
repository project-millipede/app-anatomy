import { type Getter, type Setter, atom } from 'jotai';
import { archerRefState } from './states';
import { RESET } from 'jotai/utils';

/**
 * Action Atom: Reset All Archer Element Ref *Values* (store-local)
 *
 * This variant performs a **value reset** on every primitive atom created by
 * `archerRefState`. The atom definitions remain in the family’s global cache,
 * but the data is cleared **only inside the current Jotai store**—perfect when
 * several instances of the same widget live on one page.
 *
 * Steps performed:
 * 1. Calls `archerRefState.getParams()` to obtain an iterable of every element-ID
 *    param for which the family has ever created an atom.
 * 2. For each `id`, calls `set(archerRefState(id), RESET)` – this restores the
 *    *value* of that atom **only inside the current store**. Other stores keep
 *    their own values.
 *
 * Usage:
 * ```ts
 * const resetRefs = useSetAtom(resetArcherRefsActionAtom);
 * resetRefs();   // typically in a cleanup effect
 * ```
 *
 * @param _get – Jotai `Getter` (unused here).
 * @param set  – Jotai `Setter`, used to reset each atom’s value.
 */
export const resetArcherRefsActionAtom = atom(
  null,
  (_get: Getter, set: Setter) => {
    // 1. Iterate over every param *known* to the family
    for (const id of archerRefState.getParams()) {
      // 2. Reset the value for *this store only*
      set(archerRefState(id), RESET); // store-local reset, no cross-Provider bleed
    }
  },
);
