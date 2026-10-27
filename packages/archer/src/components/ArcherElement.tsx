import type { FC, ReactNode } from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  cloneElement,
  isValidElement,
} from 'react';
import { useAtomCallback } from 'jotai/utils';

import type { SourceToTargetType } from '../types-private';
import type { ArcherElementProps, ArcherRef, SyncHandle } from '../types';

import { features } from '../features';
import {
  generateSourceToTarget,
  shallowEqualRelations,
  useShallowCompareMemo,
} from './ArcherElementUtils';

const {
  core: {
    actions: { ingestEdgesAtom, removeSourceEdgesAtom },
  },
  refs: {
    states: { archerRefState },
  },
} = features;

/**
 * Purpose:
 * Wraps a DOM or SVG node so it can act as a *source* in the Archer graph.
 * The component ties its lifecycle to the surface-local edge store (Jotai atoms):
 *   – registers its ref,
 *   – converts the `relations` prop into canonical edge objects,
 *   – requests atom mutations to add / update / remove those edges.
 *
 * Data-flow in a single render:
 * (1) relations ➜ generateSourceToTarget(...)       // normalise
 * (2) useShallowCompareMemo + shallowEqualRelations // Tier 1 memo
 * (3) useEffect edgeSync
 *     - if updateStrategy === 'replaceAll' ➜ removeSourceEdgesAtom(id)
 *     - ingestEdgesAtom(batch)
 * (4) effect cleanup always removes edges for the *previous* id, covering both
 *     unmount and id-prop changes.
 *
 * Changed declarations replace the source's previous edges through effect
 * cleanup. `replaceAll` also removes the source before ingestion.
 *
 * Equality & memoisation tiers:
 * Tier 1 – Component level
 *   - useShallowCompareMemo retains the previous relations reference.
 *   - shallowEqualRelations compares arrays via relationShallowEqual (O(1)).
 * Tier 2 – Store level
 *   - ingestEdgesAtom / removeSourceEdgesAtom perform conditional mutations,
 *     writing only when edge data truly differs, thus minimising downstream
 *     Jotai graph invalidations.
 *
 * Performance levers:
 *   - compareArrays           : reusable O(n) helper
 *   - useShallowCompareMemo   : prevents unnecessary effect executions
 *   - relationShallowEqual    : O(1) property and reference checks
 *   - Action atoms            : internal conditional writes
 *
 * Example:
 * ```tsx
 * <ArcherElement
 *   id="user-card"
 *   relations={[
 *     { targetId: 'details',
 *       sourceAnchor: 'right',
 *       targetAnchor: 'left' }
 *   ]}
 *   updateStrategy="addOrUpdate"
 * >
 *   <Card>User</Card>
 * </ArcherElement>
 * ```
 */
export const ArcherElement: FC<ArcherElementProps> = ({
  id,
  relations = [],
  interactive = false,
  updateStrategy = 'addOrUpdate',
  render,
  children,
}): ReactNode | null => {
  /**
   * 1. Refs
   *    - `ref`       : DOM/SVG node used by Archer for anchor calculations.
   *    - `dynamicRef`: imperative handle passed to consumers (optional).
   */
  const ref = useRef<Element | null>(null);
  const dynamicRef = useRef<SyncHandle | null>(null);

  /**
   * 2. Pre-bound jotai callbacks
   *    Wrap jotai action atoms so we can call them like regular functions
   *    without re-creating closures on every render.
   */
  const setArcherRefStateCallback = useAtomCallback(
    useCallback(
      (_get, set, value: ArcherRef) => set(archerRefState(id), value),
      [id],
    ),
  );

  const ingestEdgesCallback = useAtomCallback(
    useCallback((_get, set, batch: SourceToTargetType[]) => {
      set(ingestEdgesAtom, batch);
    }, []),
  );

  const removeSourceEdgesCallback = useAtomCallback(
    useCallback((_get, set, sourceIdToRemove: string) => {
      set(removeSourceEdgesAtom, sourceIdToRemove);
    }, []),
  );

  /**
   * 3. Tier-1 memoisation
   *    Stabilise the `relations` array (shallow compare) so that:
   *    – useEffect below runs only when contents truly differ,
   *    – generateSourceToTarget is invoked minimally.
   */
  const stableRelations = useShallowCompareMemo(
    relations,
    shallowEqualRelations,
  );

  // Outgoing edges for this source element, derived from its ID and relations.
  const outgoingEdges = useMemo(
    () => generateSourceToTarget(id, stableRelations),
    [id, stableRelations],
  );

  /**
   * 4. Register ref in jotai state
   *    Runs on mount and whenever `id` changes.
   */
  useEffect(() => {
    setArcherRefStateCallback({ ref, dynamicRef });
  }, [setArcherRefStateCallback]);

  /**
   * 5. Edge synchronisation effect
   *    – Optional bulk removal if strategy === 'replaceAll'.
   *    – Ingest current edges.
   *    – Cleanup always removes edges for *previous* id (unmount / id swap).
   */
  useEffect(() => {
    // 5.1 Conditional removal (replaceAll mode)
    if (updateStrategy === 'replaceAll') {
      removeSourceEdgesCallback(id);
    }

    // 5.2 Ingest current edges (if any)
    if (outgoingEdges.length > 0) {
      ingestEdgesCallback(outgoingEdges);
    }

    // 5.3 Cleanup for unmount or id change (runs before next effect)
    return () => {
      removeSourceEdgesCallback(id);
    };
  }, [
    id,
    outgoingEdges,
    updateStrategy,
    ingestEdgesCallback,
    removeSourceEdgesCallback,
  ]);

  /**
   * 6. Render logic
   *    a) If a `render` prop is supplied, delegate to it.
   *    b) Else, clone the single child element and attach refs.
   *    c) Fallback warnings for invalid configurations.
   */
  if (render)
    return interactive ? render({ ref, dynamicRef }) : render({ ref });

  if (!children) {
    console.warn(`ArcherElement "${id}" has no render function or children.`);
    return null;
  }
  if (!isValidElement(children)) {
    console.error(
      `ArcherElement id="${id}": 'children' must be a single React element.`,
    );
    return null;
  }

  return interactive
    ? cloneElement(children, { ref, dynamicRef } as any)
    : cloneElement(children, { ref } as any);
};
