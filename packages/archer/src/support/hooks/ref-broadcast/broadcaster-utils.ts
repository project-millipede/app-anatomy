import { type GenericFunction } from '../types-generic';

/**
 * =============================================================================
 * Imperative Handle Broadcaster: A Solution for Shared Refs
 * =============================================================================
 *
 * Ageneric, type-safe, and immutable solution to a critical design problem that
 * arises when multiple components need to subscribe to events from a single,
 * shared imperative handle ref.
 *
 *******************************************************************************
 * The Core Problem: Sequential Overwrites and "Last Writer Wins"
 *******************************************************************************
 *
 * A React ref object's `.current` property is a single, mutable slot. When
 * multiple components share the same ref object, they also share this single
 * slot.
 *
 * The problem occurs during React's Commit Phase, after the browser has
 * painted. In this phase, `useEffect` (or `useLayoutEffect`) cleanup and setup
 * functions are run for all components in the tree. These effects run
 * sequentially in a predictable order.
 *
 * If multiple components' `useEffect` hooks perform a direct assignment to the
 * same `ref.current`, each assignment will destructively replace the value set
 * by the previous one. The final value in the ref will be the one set by the
 * last component in the effect execution order. This is known as a "Last Writer
 * Wins" outcome.
 *
 * --- A Step-by-Step Example with Archer ---
 *
 * Let's trace the lifecycle for one `ArcherElement` (named `Anchor-X`) and two
 * `SvgArrow` components (`Arrow-A` and `Arrow-B`) that connect to it.
 *
 * 1. Setup:
 *    - `Anchor-X` exposes its `dynamicRef`.
 *    - `Arrow-A` and `Arrow-B` both receive this same `dynamicRef` object.
 *    - Both arrows use a hook (`useImperativeBroadcaster`) whose `useEffect`
 *      will attempt to write to `dynamicRef.current`.
 *
 * 2. React's Commit Phase Begins:
 *    - React has rendered the components and will now run their effects.
 *      Let's assume `Arrow-A`'s effect runs first.
 *
 * 3. `Arrow-A`'s Effect Runs:
 *    - It creates its unique listener handle: `const handleA = { ... }`.
 *    - It performs the assignment: `AnchorX.dynamicRef.current = handleA;`
 *    - At this exact moment, the system is correct.
 *      The ref points to `Arrow-A`'s handle.
 *
 * 4. `Arrow-B`'s Effect Runs (immediately after `Arrow-A`'s):
 *    - It creates its unique listener handle: `const handleB = { ... }`.
 *    - It performs its assignment: `AnchorX.dynamicRef.current = handleB;`
 *    - CRITICAL FAILURE POINT:
 *      This assignment completely overwrites the value from Step 3.
 *      The reference to `handleA` is now lost from the ref.
 *      The shared slot now contains only `handleB`.
 *
 * 5. Final State and Failure:
 *    - The Commit Phase finishes.
 *      The final value of `AnchorX.dynamicRef.current` is `handleB`.
 *    - Later, when `Anchor-X` animates, it calls `dynamicRef.current.anchorAnimationDidStart()`.
 *    - Only the function from `handleB` is executed. `Arrow-B` animates correctly.
 *    - `Arrow-A` is never notified. It was silently unsubscribed in Step 4.
 *
 ******************************************************************************
 * The Solution: An Implementation of the Broadcaster Pattern
 ******************************************************************************
 *
 * This utility solves the overwrite problem by implementing the Broadcaster
 * Pattern (a form of the Observer pattern). Instead of replacing the handle,
 * this code "augments" it, turning a plain handle into a sophisticated object
 * that can manage multiple subscribers.
 *
 * The implementation of this pattern is guided by these key principles:
 *
 * 1. State is Self-Contained:
 *    The entire state of the broadcaster—including all subscribed listeners—is
 *    stored directly on the `ref.current` object itself.
 *    This avoids hidden global state and makes debugging straightforward.
 *
 * 2. Immutability as an Implementation Detail:
 *    The `augmentHandle` and `removeListenerFromHandle` functions are pure.
 *    They never modify an existing handle. Instead, they return a brand new
 *    handle object representing the new state.
 *    This is a crucial aspect that aligns with React's change detection and
 *    prevents side effects.
 *
 * 3. Broadcasting:
 *    When a method like `anchorAnimationDidStart()` is called on an augmented
 *    handle, it executes a special "broadcaster" function. This function
 *    iterates through an internal list of all subscribed listeners and calls
 *    the `anchorAnimationDidStart` method on each one, ensuring every arrow is
 *    notified.
 *
 * The entire lifecycle is managed by the `useImperativeBroadcaster` hook, which
 * safely handles subscription (`augmentHandle`) and unsubscription
 * (`removeListenerFromHandle`).
 */

/**
 * The base constraint for the handle types, requiring an object of functions.
 */
export type ListenerHandle = Record<string, GenericFunction>;

/**
 * A dictionary mapping event keys to their corresponding broadcaster function.
 *
 * Each function in this object is a single, newly-created function that, when
 * called, will execute all the original listeners for that event.
 * This represents the "public API" part of the augmented handle that is being
 * constructed.
 *
 * @example { anchorAnimationDidStart: (id) => { ...forEach... } }
 */
type BroadcastFunctionMap<T extends ListenerHandle> = {
  [K in keyof T]?: T[K];
};

/**
 * A dictionary mapping event keys to a readonly array of the original listener
 * functions.
 * This is the internal "source of truth" or "raw material" that the broadcaster
 * functions use. It stores the actual functions provided by each subscribed
 * component.
 *
 * This type definition is used to construct the accumulator, which is why the
 * top-level properties are mutable.
 *
 * @example { anchorAnimationDidStart: [fnFromArrow1, fnFromArrow2] }
 */
type BroadcastListenerStore<T extends ListenerHandle> = {
  [K in keyof T]?: Readonly<T[K][]>;
};

/**
 * Configuration object to define which keys of a handle should be broadcasted.
 */
export type BroadcasterConfig<T extends ListenerHandle> = {
  broadcastKeys: readonly (keyof T)[];
};

/**
 * The shape of the accumulator object used by the `augmentHandle` reducer.
 * It uses the internal "builder" types to construct the final state.
 */
type AugmentAccumulator<T extends ListenerHandle> = {
  broadcastFunctions: BroadcastFunctionMap<T>;
  broadcastListeners: BroadcastListenerStore<T>;
};

/**
 * The shape of the accumulator object used by the `removeListenerFromHandle`
 * reducer.
 */
type RemoveAccumulator<T extends ListenerHandle> = AugmentAccumulator<T> & {
  totalListeners: number;
};

/**
 * Represents a standard handle object (`T`) that has been "augmented" with
 * special internal properties to manage and broadcast events to multiple
 * listeners.
 *
 * This data structure is the core of the broadcaster utility.
 * It is designed with two key principles in mind:
 * - Immutable:
 *   New instances are created on every change to work seamlessly with React's
 *   change detection.
 * - Self-Contained:
 *   All state is stored directly on this object, avoiding any hidden global
 *   state.
 *
 * @template T The original, plain listener handle type (e.g., `SyncHandle`). The
 *             `GenericBroadcastHandle` will have the same public-facing methods
 *             as `T`, but those specified in the config are replaced by broadcaster functions.
 */
type GenericBroadcastHandle<T extends ListenerHandle> = T & {
  /**
   * A runtime marker used by the `isBroadcaster` type guard to reliably
   * identify this object as an augmented handle, distinguishing it from a plain
   * one.
   *
   * This `_kind` property is an explicit "brand" on the object. We use this
   * pattern over a boolean like `_isBroadcaster: true` because it's less
   * ambiguous—the property is never `false`, so its presence and specific
   * string value are what confirm the object's type.
   */
  readonly _kind: 'BroadcasterHandle';

  /**
   * The internal "source of truth" for the broadcaster.
   *
   * This dictionary stores the arrays of the original, "raw" listener functions
   * that have subscribed to each event. The public-facing broadcaster methods
   * on the handle (e.g., `anchorAnimationDidStart`) are newly created functions
   * that read from this store to execute all the subscribed listeners.
   *
   * @example
   * ```ts
   * // If two arrows have subscribed, this object's internal store might look like:
   * _broadcastListeners: {
   *   anchorAnimationDidStart: [ fnFromArrow1, fnFromArrow2 ],
   *   anchorAnimationDidEnd: [ fnFromArrow1, fnFromArrow2 ]
   * }
   * ```
   */
  readonly _broadcastListeners: BroadcastListenerStore<T>;
};

/**
 * A custom type guard that performs a runtime check to determine if a value
 * is a valid, fully-formed `GenericBroadcastHandle`.
 *
 * This function is crucial for distinguishing an "augmented" broadcaster handle
 * from a "plain, un-augmented" one. A plain handle is the simple object stored
 * in the ref when only a single listener has subscribed. The guard manages the
 * state transition as more listeners are added:
 *
 * 1. When a second listener subscribes:
 *    The `existingHandle` is a plain object. This function is called, returns
 *    `false`, and signals that the plain handle must be "upgraded" into a full
 *    broadcaster.
 * 2.  When a third (and subsequent) listener subscribes:
 *     The `existingHandle` is now a full broadcaster. This function returns
 *     `true`, signaling that the new listener can simply be added to the
 *     existing structure.
 *
 * If the function returns `true`, TypeScript's control flow analysis will also
 * narrow the checked variable's type, allowing safe access to
 * broadcaster-specific properties like `_broadcastListeners`.

 * @param handle The variable to check, which is typed as `unknown`.
 * @returns `true` if the handle is a valid broadcaster object; otherwise, `false`.
 */
const isBroadcaster = <T extends ListenerHandle>(
  handle: unknown,
): handle is GenericBroadcastHandle<T> => {
  return (
    handle !== null &&
    typeof handle === 'object' &&
    // Check for the specific branding property and its value.
    (handle as GenericBroadcastHandle<T>)._kind === 'BroadcasterHandle'
  );
};

/**
 * A factory function that takes an array of listener functions and composes
 * them into a single "broadcaster" function.
 *
 * When invoked, the returned broadcaster iterates through the original
 * `listeners` array and calls each function in sequence with the same
 * arguments.
 *
 * Behavior Note:  This function returns `void` by design.
 * It is built specifically for triggering side effects (e.g., UI updates).
 * Any return values from the individual listener functions are intentionally
 * discarded. This provides a simple and predictable API where the caller does
 * not need to handle multiple, potentially conflicting, return values.
 *
 * @param listeners A readonly array of the original functions to be called.
 * @returns A single new function that, when called, will execute all listeners.
 */
const createBroadcaster = <TFunc extends GenericFunction>(
  listeners: Readonly<TFunc[]>,
): TFunc => {
  // Adapts the void-returning implementation to the generic TFunc signature.
  return ((...args: Parameters<TFunc>): void => {
    for (const listener of listeners) {
      listener(...args);
    }
  }) as TFunc;
};

/**
 * An internal helper that safely extracts the list of previously subscribed
 * listener functions for a specific event key.
 *
 * It correctly handles the three possible states of the `handle` argument:
 *
 * 1. Full Broadcaster:
 *    If the handle is already an augmented broadcaster, it returns the internal
 *    array of listeners stored for the given key.
 * 2. Plain Handle:
 *    If the handle is a plain object (the state when only one listener has
 *    subscribed), it treats that handle's method as the single previous
 *    listener and returns it wrapped in an array.
 * 3. Null or Undefined:
 *    If the handle is null (the state before any listeners have subscribed), it
 *    returns an empty array.
 *
 * @template T The generic listener handle type.
 * @param handle The handle to inspect, which can be a broadcaster, a plain object, or null.
 * @param key The specific event key (e.g., `anchorAnimationDidStart`) whose listeners to get.
 * @returns A readonly array of the previously subscribed listener functions for that key.
 */
const getPreviousListeners = <T extends ListenerHandle>(
  handle: T | null | undefined,
  key: keyof T,
): Readonly<T[typeof key][]> => {
  // 1. The handle is already an augmented broadcaster.
  if (isBroadcaster<T>(handle)) {
    return handle._broadcastListeners[key] ?? [];
  }
  // 2. The handle is a plain object (i.e., the first listener).
  if (handle) {
    return [handle[key]];
  }
  // 3. The handle is null or undefined.
  return [];
};

/**
 * An internal reducer function responsible for the core logic of
 * `augmentHandle`.
 *
 * For a single event key, this function determines the list of previous
 * listeners, adds the new listener to create a combined list, and then
 * generates a new broadcaster function for that combined list.
 *
 * It populates the accumulator object with both the new public-facing
 * broadcaster function and the internal list of raw listeners it uses.
 *
 * @template T The generic listener handle type.
 * @param acc The mutable accumulator object (`AugmentAccumulator`) being built by the reducer.
 * @param key The current event key (e.g., `anchorAnimationDidStart`) being processed.
 * @param existingHandle The handle state before this new listener was added.
 * @param newListener The new listener handle that is being subscribed.
 * @returns The mutated accumulator for the next iteration of the reducer.
 */
const reduceToAugmentKey = <T extends ListenerHandle>(
  acc: AugmentAccumulator<T>,
  key: keyof T,
  existingHandle: T | null | undefined,
  newListener: T,
): AugmentAccumulator<T> => {
  // 1. Safely determine the list of all listeners that subscribed before this
  //    one.
  const previousListeners = getPreviousListeners(existingHandle, key);

  // 2. Create the next state's listener list by immutably adding the new
  //    listener.
  const nextListeners = [...previousListeners, newListener[key]];

  // 3. Update the accumulator with the state for this event key.
  acc.broadcastFunctions[key] = createBroadcaster(nextListeners);
  acc.broadcastListeners[key] = nextListeners;

  return acc;
};

/**
 * An internal reducer function responsible for the core logic of
 * `removeListenerFromHandle`.
 *
 * For a single event key, it calculates the new, smaller list of listeners by
 * filtering out the one to be removed.
 *
 * A new broadcaster function must be created for this smaller list.
 *
 * This is crucial because a JavaScript function "remembers" the variables from
 * its creation scope (closure).
 * - The original broadcaster function is permanently linked to the old, larger
 *   array of listeners.
 * - To update the handle's behavior, we must replace it with a new function
 *   that is linked to the new, smaller array.
 *
 * This function also updates a counter (`totalListeners`) used by the caller to
 * determine if any listeners remain on the handle after the operation.
 *
 * @internal
 * @template T The generic listener handle type.
 * @param acc The mutable accumulator object (`RemoveAccumulator`) being built by the reducer.
 * @param key The current event key (e.g., `anchorAnimationDidStart`) being processed.
 * @param existingHandle The full broadcaster handle before the listener is removed.
 * @param listenerToRemove The listener handle that is being unsubscribed.
 * @returns The mutated accumulator for the next iteration of the reducer.
 */
const reduceToRemoveKey = <T extends ListenerHandle>(
  acc: RemoveAccumulator<T>,
  key: keyof T,
  existingHandle: GenericBroadcastHandle<T>,
  listenerToRemove: T,
): RemoveAccumulator<T> => {
  // 1. Get the current list of raw listeners for this event key.
  const currentListeners = existingHandle._broadcastListeners[key] ?? [];

  // 2. Create the new, smaller list by immutably filtering out the target
  //    listener.
  const remainingListeners = currentListeners.filter(
    (fn) => fn !== listenerToRemove[key],
  );

  // 3. Update the accumulator with the new state for this event key.
  acc.broadcastFunctions[key] = createBroadcaster(remainingListeners);
  acc.broadcastListeners[key] = remainingListeners;

  // 4. Increment the total listener count. This sum across all processed keys
  //    is used by the caller to check if the handle has become completely empty
  //    and should be set to null.
  acc.totalListeners += remainingListeners.length;

  return acc;
};

/**
 * Immutably creates a new, broadcast-capable handle by adding a new listener.
 *
 * This function is the core of the "augmentation" process.
 * It transforms a "plain handle" (from a single listener) into an "augmented
 * handle" (a broadcaster) the first time a second listener subscribes.
 * It is designed to safely handle the `existingHandle` argument in any of its
 * possible states (null, plain, or already augmented) and will always return a
 * new, correctly configured broadcaster.
 *
 * @notice Behavior of Non-Broadcasted Methods:
 * Methods on the handle that are not specified in the `broadcastKeys` config
 * (e.g., `sync`) are not part of the broadcasting mechanism.
 * They follow a simple "last writer wins" pattern, where the final handle will
 * always contain the method from the most recently added listener
 * (`newListener`). This is a deliberate design choice for simplicity.
 *
 * @example
 * // Let's trace the transformation when a second listener (`listenerB`) is added.
 *
 * // The `existingHandle` from the first listener (`listenerA`):
 * const existingHandle = {
 *   _kind: 'BroadcasterHandle',
 *   _broadcastListeners: { start: [fnA] },
 *   start: broadcasterForA, // Its public API calls fnA
 *   sync: syncFnA           // Its passthrough method is from Arrow A
 * };
 *
 * // The `newListener` from the second subscriber (`listenerB`):
 * const newListener = { start: fnB, sync: syncFnB };
 *
 * // This function returns a brand new handle object:
 * const finalHandle = {
 *   _kind: 'BroadcasterHandle',
 *   _broadcastListeners: { start: [fnA, fnB] },      // Listener list is updated
 *   start: newBroadcasterForAB,                      // Public API is now a new broadcaster
 *   sync: syncFnB                                    // Passthrough method uses the latest listener
 * };
 *
 * @template T The generic listener handle type.
 * @param existingHandle The handle state from `ref.current` before this new listener is added.
 * @param newListener The new listener handle from the component that is currently subscribing.
 * @param config The configuration defining which keys to broadcast.
 * @returns A new, augmented handle that includes the new listener.
 */
export function augmentHandle<T extends ListenerHandle>(
  existingHandle: T | null | undefined,
  newListener: T,
  config: BroadcasterConfig<T>,
): T {
  const initialState: AugmentAccumulator<T> = {
    broadcastFunctions: {},
    broadcastListeners: {},
  };

  const finalState = config.broadcastKeys.reduce(
    (acc, key) => reduceToAugmentKey(acc, key, existingHandle, newListener),
    initialState,
  );

  const finalHandle: GenericBroadcastHandle<T> = {
    /**
     * 1. Set Base Object & Passthrough Methods
     *    Spreading `newListener` first accomplishes two things:
     *    a) It provides the base shape for the handle.
     *    b) It sets the "last writer wins" behavior for all non-broadcasted
     *       methods.
     */
    ...newListener,

    /**
     * 2. Overwrite Public API with Broadcasters
     *    Spreading `broadcastFunctions` next has two effects:
     *    a) It overwrites the properties for keys specified in `broadcastKeys`.
     *    b) It installs the new, smart broadcaster functions for those keys.
     */
    ...finalState.broadcastFunctions,

    /**
     * 3. Attach Internal Metadata
     *    The final properties define the broadcaster's identity and its data:
     *    a) `_kind`: The runtime marker that identifies this as an augmented handle.
     *    b) `_broadcastListeners`: The internal store of raw listener arrays.
     */
    _kind: 'BroadcasterHandle',
    _broadcastListeners: finalState.broadcastListeners,
  };

  return finalHandle;
}

/**
 * Immutably removes a listener from a generic broadcast handle.
 *
 * This function operates based on the following principles:
 * 1. It takes an existing broadcaster and the specific listener to remove.
 * 2. It returns a **new, smaller broadcaster handle** and will never mutate the
 *    `existingHandle`.
 * 3. If the last remaining listener is removed, it returns `null` to signal
 *    that the handle should be destroyed.
 *
 * @template T The generic listener handle type.
 * @param existingHandle The current broadcaster handle from which to remove a listener.
 * @param listenerToRemove The specific listener handle that is being unsubscribed.
 * @param config The configuration defining which keys were broadcasted.
 * @returns A new, smaller handle with the listener removed, or `null` if no listeners remain.
 */
export function removeListenerFromHandle<T extends ListenerHandle>(
  existingHandle: T | null | undefined,
  listenerToRemove: T,
  config: BroadcasterConfig<T>,
): T | null {
  // Guard clause: If it's not a broadcaster, there's nothing to remove.
  if (!isBroadcaster<T>(existingHandle)) {
    return null;
  }

  const initialState: RemoveAccumulator<T> = {
    broadcastFunctions: {},
    broadcastListeners: {},
    totalListeners: 0,
  };

  const finalState = config.broadcastKeys.reduce(
    (acc, key) => reduceToRemoveKey(acc, key, existingHandle, listenerToRemove),
    initialState,
  );

  // If the total listener count across all keys is now zero, destroy the
  // handle.
  if (finalState.totalListeners === 0) {
    return null;
  }

  /**
   * The new, smaller handle is constructed in three stages:
   *
   * 1. Base Object & Unchanged Properties:
   *    A spread of the `existingHandle` is used as the base. This preserves all
   *    non-broadcasted properties (like `sync`) and the internal `_kind` brand.
   *
   * 2. Public API Update:
   *    The `broadcastFunctions` from the reducer state are then spread. This
   *    overwrites the old public API with new, smaller broadcaster functions
   *    that are linked to the reduced listener list.
   *
   * 3.  Internal Store Update:
   *     Finally, the `_broadcastListeners` property is overwritten with the
   *     new, smaller arrays of raw listeners.
   */
  const finalHandle: GenericBroadcastHandle<T> = {
    ...existingHandle,
    ...finalState.broadcastFunctions,
    _broadcastListeners: finalState.broadcastListeners,
  };

  return finalHandle;
}
