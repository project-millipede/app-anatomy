import { type Getter, type Setter, atom } from 'jotai';
import { RESET } from 'jotai/utils';

import { type SourceToTargetType } from '../../types-private';
import { edgeFamily, pairKeyRegistryAtom } from './states';
import { makePairKey } from '../../utils/pair';

/**
 * ============================================================================
 * Action Atoms for Archer Edge State Management
 * ============================================================================
 *
 * In Jotai, an **atom** represents a piece of state. While atoms can hold
 * values directly (primitive atoms) or compute values (derived atoms), they can
 * also be defined as **Action Atoms**.
 *
 * Action Atoms are typically **write-only**. Their primary purpose is not to
 * hold a readable value (their read value is often `null`), but to encapsulate
 * specific state update logic within their `write` function. When you `set` an
 * action atom, you trigger this `write` function.
 *
 * Benefits:
 * - Encapsulation: Keeps complex update logic tied to the action's intent.
 * - Reusability: Components can trigger actions without knowing the underlying
 *   state structure.
 * - Batching: Jotai automatically batches multiple `set` calls within the
 *   `write` function into a single, atomic state update.
 * - DevTools Integration: Actions often appear clearly in Jotai DevTools.
 *
 * The atoms defined below are action atoms used to modify the central Archer
 * edge state (`sourceEdgeMapAtom` and `activeSourceIdsAtom`).
 * Each incorporates "Conditional Store Mutation" logic to prevent redundant
 * updates.
 *
 * Obtain their setters using `useSetAtom()` in components or `store.set()`
 * elsewhere.
 */

/**
 * Action Atom: Ingest and Update Edge Data Batch
 *
 * A write-only "action atom" to process a batch (array) of incoming edge data
 * (`SourceToTargetType[]`), merging it into the `edgeFamily` state.
 *
 * Ensures one primitive atom per A-B pair in `edgeFamily`, correctly handling
 * `doubleHeaded` status and preserving referential stability for unchanged
 * data.
 *
 * Also updates `pairKeyRegistryAtom` with any new pair keys encountered.
 *
 * Conditional Store Mutation:
 * This atom ensures store mutations occur only when necessary:
 * 1. Individual `edgeFamily` atoms are only `set` if incoming edge data
 *    (orientation, metadata) differs from the current state for that `pairKey`.
 * 2. `pairKeyRegistryAtom` is only `set` if the set of unique `pairKey`s
 *    changes after processing the batch.
 * This prevents redundant updates and re-renders.
 *
 * Core Logic Flow (per edge in batch):
 * 1. Generate the canonical `pairKey`.
 * 2. Add the `pairKey` to a working copy of the `pairKeyRegistryAtom`
 *    (a Set, which automatically handles duplicates).
 * 3. Get the previous data (`prevData`) for this `pairKey` from `edgeFamily`.
 * 4. Calculate the `nextData` state, creating a new object *only* if needed:
 *    a. If `prevData` is `null` (first time seeing pair): Initialize `nextData`
 *       with incoming `edge` data and `doubleHeaded: false`.
 *    b. If `prevData` exists: Calculate `nextData` only if the incoming `edge`
 *       represents a change (orientation needing flip, or metadata update).
 *       Otherwise, `nextData` remains `null` (no update needed).
 * 5. Update the specific `edgeFamily` atom *only* if `nextData` was calculated (is not `null`).
 * 6. After processing the entire batch, compare the size of the working
 *    registry copy with the size of the original `pairKeyRegistryAtom`.
 *    If they differ (indicating new unique keys were added), update
 *    `pairKeyRegistryAtom` with the working copy.
 *
 * Handling Duplicates and Opposing Directions within the Same Batch:
 * Correctly processes batches containing duplicates or A→B/B→A pairs by reading
 * the latest atom state (via `get`) within the loop (Step 3) before calculating
 * the update (Step 4), ensuring accurate `doubleHeaded` flips. Redundant edges
 * result in Step 4 calculating `null` for `nextData`, thus skipping Step 5's
 * update.
 *
 * Benefits: Single state lookup per edge, referential stability, Jotai
 * batching.
 *
 * Jotai's Batching:
 * All `set` calls made within this entire action's setter function are batched
 * together by Jotai.
 *
 * This includes:
 *  - `set(pairAtom, ...)` calls made inside the `forEach` loop.
 *  - `set(pairKeyRegistryAtom, ...)` final call.
 *
 * This batching ensures that all state changes are applied atomically,
 * leading to a single reconciliation/render pass in React components
 * subscribed to these atoms.
 *
 * Usage: `useSetAtom(ingestEdgesAtom)(batchOfEdges);`
 *
 * @param get - Jotai's get function.
 * @param set - Jotai's set function.
 * @param batch - An array of `SourceToTargetType` edge data objects.
 */

export const ingestEdgesAtom = atom(
  null, // Read value is null, effectively write-only.
  (get, set, batch: SourceToTargetType[]) => {
    // Get the original registry to compare its size at the end.
    const originalRegistry = get(pairKeyRegistryAtom);
    // Create a working copy of the registry for modifications during batch processing.
    const workingRegistry = new Set(originalRegistry);

    batch.forEach((edge) => {
      // 1. Generate canonical key for the A-B pair.
      const pairKey = makePairKey(edge.source.id, edge.target.id);

      /**
       * 2. Add key to the working registry. Set.add() handles duplicates
       *    implicitly; if the key already exists, the set and its size remain
       *    unchanged by this specific add operation.
       */
      workingRegistry.add(pairKey);

      // 3. Get the specific atom and its previous data for this pair.
      const pairAtom = edgeFamily(pairKey);
      const prevData = get(pairAtom); // null | SourceToTargetType

      // 4. Determine the `nextData`, calculating only if a change is needed.
      let nextData: SourceToTargetType | null = null;

      if (prevData === null) {
        /**
         * 4a. First time seeing this pair key.
         *     Initialize the atom's state with the incoming edge data, marking
         *     it as single-headed initially.
         */
        nextData = { ...edge, doubleHeaded: false };
      } else {
        /**
         * 4b. Pair already exists in the state (`prevData` is not null).
         *     Check if the incoming `edge` requires an update to `prevData`.
         */
        const isOrientationDifferent =
          edge.source.id !== prevData.source.id ||
          edge.target.id !== prevData.target.id;

        const hasLabelOrStyleChanged =
          edge.label !== prevData.label ||
          edge.style !== prevData.style ||
          edge.source.anchor !== prevData.source.anchor ||
          edge.source.optionalAnchor !== prevData.source.optionalAnchor ||
          edge.source.layout !== prevData.source.layout ||
          edge.source.pathStyle !== prevData.source.pathStyle ||
          edge.source.meta !== prevData.source.meta ||
          edge.target.anchor !== prevData.target.anchor ||
          edge.target.optionalAnchor !== prevData.target.optionalAnchor;

        // Flip needed only if orientation is different AND it wasn't already
        // double-headed.
        const needsDoubleHeadedFlip =
          isOrientationDifferent && !prevData.doubleHeaded;

        // Only create a new `nextData` object if necessary.
        if (needsDoubleHeadedFlip || hasLabelOrStyleChanged) {
          nextData = {
            // Preserve stable fields from previous state
            ...prevData,
            // Overlay fields from incoming edge (orientation, metadata)
            ...edge,
            // Set true if flip needed or already true
            doubleHeaded: prevData.doubleHeaded || isOrientationDifferent,
          };
        }
        /**
         * If neither condition is met, nextData remains null, indicating no
         * change needed.
         */
      }

      /**
       * 5. Conditional Write:
       *    Update the specific edge atom ONLY if a new state object was
       *    calculated in Step 4 (`nextData` is not null).
       *    Preserves referential stability otherwise.
       */
      if (nextData !== null) {
        set(pairAtom, nextData);
      }
    });

    /**
     * 6. Conditional Write:
     *    Commit the registry update to `pairKeyRegistryAtom` ONLY if its size
     *    has changed (new unique pairKeys were added).
     */
    if (workingRegistry.size !== originalRegistry.size) {
      set(pairKeyRegistryAtom, workingRegistry);
    }
  },
);

/**
 * Defines the payload structure for updating an edge's data.
 */
export type EdgeUpdatePayload = {
  /**
   * The canonical `pairKey` string identifying the direction-agnostic
   * node pair whose edge data is to be updated.
   */
  key: string;
  /**
   * An object containing the properties of `SourceToTargetType` to be
   * shallowly merged into the existing edge data.
   */
  patch: Partial<SourceToTargetType>;
};

/**
 * A write-only "action atom" for applying partial updates (patches) to the data
 * of a specific edge, as defined by an {@link EdgeUpdatePayload}.
 *
 * This atom centralizes edge update logic. Callers provide an
 * `EdgeUpdatePayload` containing the `pairKey` and a `patch` object.
 * `updateEdgeAtom` then locates the corresponding `edgeFamily` primitive atom
 * and merges the patch.
 *
 * Conditional Store Mutation:
 * 1. No update occurs if the target edge (`prevEdgeData`) does not exist.
 * 2. Jotai's `set` on the primitive `edgeFamily` atom itself only triggers
 *    updates if the new, patched data actually differs from the previous data.
 *
 * Benefits include centralized side-effect management and abstraction over the
 * `edgeFamily` storage, aiding maintainability.
 *
 * Usage:
 * ```ts
 * const updateEdge = useSetAtom(updateEdgeAtom);
 * const payload: EdgeUpdatePayload = { key: "nodeA-nodeB", patch: { label: "New Label" } };
 * updateEdge(payload);
 * // Or directly:
 * // updateEdge({ key: "nodeA-nodeB", patch: { label: "New Label" } });
 * ```
 *
 * This offers a centralized alternative to directly updating an
 * `edgeFamily(pairKey)` atom instance (suitable for simple, localized updates).
 *
 * @param _get    Jotai's get function (not used in this setter).
 * @param set     Jotai's set function, to update the target `edgeFamily` atom.
 * @param payload The {@link EdgeUpdatePayload} containing the `key` of the edge
 *                to update and the `patch` to apply. (Destructured in
 *                implementation).
 */
export const updateEdgeAtom = atom(
  null, // Read value is null, making it effectively write-only.
  (_get, set, { key, patch }: EdgeUpdatePayload) => {
    // 1. Get the primitive atom for the specified edge pair using `key`.
    const targetEdgeAtom = edgeFamily(key);

    set(targetEdgeAtom, (prevEdgeData) => {
      /**
       * 2. Conditional Write:
       *    If no current data exists, do not attempt to patch.
       */
      if (!prevEdgeData) {
        return prevEdgeData; // which is null
      }
      /**
       * 3. Apply the `patch`: shallow-merge new properties.
       *    Jotai's `set` on primitive atom is inherently conditional.
       */
      return { ...prevEdgeData, ...patch };
    });
  },
);

/** Remove stored edges declared by this source, using endpoint data rather than parsing opaque IDs. */
export const removeSourceEdgesAtom = atom(
  null, // Read value is null, effectively write-only.
  (get, set, sourceIdToRemove: string) => {
    // 1. Get the current state of the pairKey registry.
    const currentKeysInRegistry = get(pairKeyRegistryAtom);
    const keysToDelete: Array<string> = [];

    currentKeysInRegistry.forEach((pairKey) => {
      const edgeData = get(edgeFamily(pairKey));

      // 3. Collect key for deletion if its actual source matches.
      if (edgeData?.source.id === sourceIdToRemove) {
        keysToDelete.push(pairKey);
        set(edgeFamily(pairKey), RESET);
      }
    });

    /**
     * 4. Conditional Write:
     *    Only update registry if keys were actually marked for deletion.
     */
    if (keysToDelete.length === 0) {
      // No keys to delete, no state change needed.
      return;
    }

    /**
     * 5a. Create a new Set for the updated registry.
     *     Start with a clone of the current registry, then remove the targeted
     *     keys. This ensures immutability for `pairKeyRegistryAtom`.
     */
    const nextRegistry = new Set(currentKeysInRegistry);
    keysToDelete.forEach((key) => nextRegistry.delete(key));

    /*
     * 5b. Commit the change to the central pairKeyRegistryAtom.
     *     Derived atoms will react to this update, cascading changes through
     *     the UI.
     */
    set(pairKeyRegistryAtom, nextRegistry);
  },
);

/* ------------------------------------------------------------------------- */
/*                    Why “RESET” instead of “remove” ?                      */
/* ------------------------------------------------------------------------- */
/**
 * - `edgeFamily.remove(pairKey)` erases the **atom configuration** from the
 *   family’s global Map. That takes effect across *all* Jotai stores on the
 *   page, so calling it in one widget wipes the atom for every sibling widget,
 *   even when each widget sits in its own `<Provider store={…}>`.
 *
 * - `set(edgeFamily(pairKey), RESET)` leaves the config intact and only clears
 *   the **value** contained in *this* store. Other stores keep their own value
 *   for the same param key. The cached key uses negligible memory and is
 *   revived with a fresh initial value the next time the atom is read.
 *
 * Choose **RESET** when you need per-instance isolation (most UIs). Reserve
 * **remove** for rare scenarios where you genuinely must delete the atom
 * definitions themselves and you are sure no other store relies on them.
 */

/**
 * Action Atom: Reset All Archer Edge *Values* (store-local)
 *
 * This variant performs a **value reset** instead of deleting the atom
 * definitions from `edgeFamily`’s global cache. It is the safer choice when
 * multiple Jotai stores (e.g. two `<Demonstrator>` widgets) coexist on the
 * same page, because each store is cleared independently.
 *
 * Steps performed:
 * 1. Calls `edgeFamily.getParams()` to obtain an iterable of every `pairKey`
 *    for which `edgeFamily` has ever created an atom.
 * 2. For each `pairKey`, calls `set(edgeFamily(pairKey), RESET)` – this
 *    restores the *value* of that atom **only inside the current store**.
 *    The atom *config* and its key remain cached globally, but that does not
 *    affect isolation of values.
 * 3. Resets `pairKeyRegistryAtom` to an empty `Set` with `RESET`, so all
 *    derived atoms recompute and the UI removes every rendered edge.
 *
 * Usage:
 * ```ts
 * const resetArcherState = useSetAtom(resetArcherActionAtom);
 * resetArcherState(); // typically in a cleanup effect
 * ```
 *
 * @param _get  – Jotai `Getter` (unused here).
 * @param set   – Jotai `Setter`, used for per-atom and registry resets.
 */
export const resetArcherActionAtom = atom(null, (_get: Getter, set: Setter) => {
  // 1. Iterate over all params *known* to the family
  for (const pairKey of edgeFamily.getParams()) {
    // 2. Reset the value for *this store only*.
    set(edgeFamily(pairKey), RESET); // store-local reset, no cross-Provider bleed
  }

  // 3. Clear the registry (also store-local).
  set(pairKeyRegistryAtom, RESET);
});
