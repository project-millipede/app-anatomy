import type { SetStateAction, WritableAtom } from 'jotai';
import { atomFamily } from 'jotai-family';
import { atomWithReset, RESET } from 'jotai/utils';
import type { ArcherRef } from '../../types';

/**
 * ArcherElement Ref Registry
 *
 * Purpose:
 * Maintain **one writable atom per `<ArcherElement>` instance** that stores two
 * React refs:
 *
 *   - `ref`         – `RefObject<Element | null>` pointing to the DOM/SVG
 *   - `dynamicRef`  – `RefObject<SyncHandle | null>` consumed by the resize /
 *                     re‑layout logic
 *
 * Why an *atom family*?
 * - Isolation — `archerRefState(id)` returns an independent primitive
 *   atom for that ID; updating element “A” never re‑renders element “B”.
 *
 * - Ergonomics — Components just call
 *   `const [refs, setRefs] = useAtom(archerRefState(id));`
 *   to read or write their own refs—no map look‑ups or selectors needed.
 *
 * Type signature:
 *   atomFamily<
 *     string,   // key = element ID
 *     WritableAtom<
 *       ArcherRef,                   // value
 *       [SetStateAction<ArcherRef>], // write‑params tuple
 *       void                         // no return from setter
 *     >
 *   >
 *
 * Default value for every element:
 * {
 *   ref:        { current: null },
 *   dynamicRef: { current: null }
 * }
 * ================================================================
 */
export const archerRefState = atomFamily<
  string,
  WritableAtom<ArcherRef, [SetStateAction<ArcherRef> | typeof RESET], void>
>(
  // Factory — creates the primitive atom for a given element ID
  (_id: string) =>
    atomWithReset<ArcherRef>({
      ref: { current: null }, // DOM / SVG node ref
      dynamicRef: { current: null }, // SyncHandle ref
    }),

  // Comparator — simple strict equality is enough for string IDs
  (a, b) => a === b,
);
