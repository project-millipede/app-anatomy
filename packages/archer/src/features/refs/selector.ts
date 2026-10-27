import { type Getter } from 'jotai';

import { HooksUtils } from '../../support';
import { type ArcherRef } from '../../types';

import { archerRefState } from './states';

/**
 *
 * A thin “value‑selector” that reads the `ArcherRef` stored in
 * `archerRefState(archerId)` and hands that object back.
 *
 * Signature: (get, archerId) → ArcherRef // returns the *value* only
 *
 * What it does:
 * Reads the `ArcherRef` stored in `archerRefState(archerId)` and hands
 * that object back. Designed to be used with `useAtomSelector`.
 *
 * Reactivity, step‑by‑step:
 * 1. Component calls
 *      const refObj = useAtomSelector(archerRefSelectorFunction, id);
 *
 * 2. `useAtomSelector` creates a derived atom on the fly
 *      const derived = atom(get => selector(get, id));
 *      return useAtomValue(derived);           // subscribes here
 *
 * 3. Selector body runs
 *      const specific = archerRefState(id);    // build primitive atom
 *      return get(specific);                   // read + register dep
 *
 * 4. Somewhere else
 *      set(archerRefState(id), newRefObj);     // new object reference
 *      → Jotai invalidates `derived`
 *      → component re‑renders with fresh `refObj`
 *
 * Notes:
 * - A single `get(specific)` is enough; Jotai tracks the dependency.
 * - Mutate the ref object by *replacing* it (new reference), not by changing
 *   fields in place, otherwise the update won’t be detected.
 * -------------------------------------------------------------------
 */
export const archerRefSelectorFunction: HooksUtils.Jotai.SelectorFunction<
  ArcherRef,
  string
> = (get: Getter, archerId: string): ArcherRef => {
  // 1. Build (but don’t read) the primitive atom for this ID
  const specificRefAtom = archerRefState(archerId);

  // 2. Read its current value — this sets up dependency tracking
  return get(specificRefAtom);
};
