import { useEffect } from 'react';
import { type GenericFunction } from '../types-generic';

/**
 * @hook useSignalCallbackPresence
 * @description Executes a `recipientCallback` based on the presence, change,
 * or cleanup lifecycle of a provided `sourceCallback` function.
 *
 * This hook is designed to bridge communication, often used when a child
 * component or hook generates a `sourceCallback` (like a ref setter or an API
 * function) and a parent or orchestrator (via the `recipientCallback`) needs to
 * be informed of its availability or when it's no longer active.
 *
 * --- How It Works ---
 * - When the `sourceCallback` prop is first provided (and is a valid function)
 *   or when its identity changes, the `recipientCallback(sourceCallback)` is
 *   called.
 * - If `sourceCallback` is initially `null` or `undefined`,
 *   `recipientCallback(null)` is called.
 * - On unmount of the component using this hook, or if dependencies of the
 *   internal `useEffect` change (triggering cleanup before a re-run),
 *   `recipientCallback(null)` is called to signal that the `sourceCallback`
 *   from that effect's scope is no longer considered "active" or "current".
 *
 * @template TSourceCallback The type of the source callback function whose lifecycle is being signaled.
 *
 * @param sourceCallback The function instance whose presence and lifecycle is being tracked.
 *                       The `recipientCallback` is called when this prop's identity changes or
 *                       when it transitions between being a function and null/undefined.
 * @param recipientCallback A callback function that receives the `sourceCallback` (if it's
 *                          a valid function) or `null` (if `sourceCallback` is null/undefined,
 *                          or during the effect's cleanup phase).
 */
export const useSignalCallbackPresence = <
  TSourceCallback extends GenericFunction,
>(
  sourceCallback: TSourceCallback | null | undefined,
  recipientCallback: (activeCallback: TSourceCallback | null) => void,
): void => {
  // This hook is for side effects and does not return a value.

  // This effect runs when `sourceCallback` or `recipientCallback` function identities change.
  useEffect(() => {
    // Check if the sourceCallback is currently a valid function.
    if (typeof sourceCallback === 'function') {
      /**
       * If it's a valid function, invoke the recipientCallback with the sourceCallback.
       * This happens on initial mount (if sourceCallback is immediately available)
       * or when sourceCallback changes to a new function instance.
       */
      // console.log('[useSignalCallbackPresence] Notifying recipient with active sourceCallback.');
      recipientCallback(sourceCallback);
    } else {
      /**
       * If sourceCallback is null or undefined (e.g., initially, or if it was unset),
       * invoke the recipientCallback with null to signal its absence or "not ready" state.
       */
      // console.log('[useSignalCallbackPresence] sourceCallback is null/undefined. Notifying recipient with null.');
      recipientCallback(null);
    }

    /*
     * Cleanup function for this effect:
     * This function is executed when:
     *  1. The component using this hook unmounts.
     *  2. Before the effect re-runs due to a change in its dependencies
     *     (`sourceCallback` or `recipientCallback`).
     * In both scenarios, it signals that the `sourceCallback` associated with
     * *this specific run of the effect* is no longer considered the "active"
     * one by calling the recipientCallback with null.
     */
    return () => {
      // console.log('[useSignalCallbackPresence] Effect cleanup: Notifying recipient with null.');
      recipientCallback(null);
    };
    /*
     * Dependencies:
     * - sourceCallback: The effect should re-run if the instance of the source
     *   function changes, allowing the recipientCallback to be called with the
     *   new function or null.
     * - recipientCallback: If the recipientCallback itself changes, the effect
     *   should re-run to ensure the new recipientCallback is used and the old
     *   one's context for cleanup (if any implicitly tied, though not typical
     *   for this pattern) is handled.
     */
  }, [sourceCallback, recipientCallback]);
};
