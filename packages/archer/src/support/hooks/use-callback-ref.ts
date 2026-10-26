import { useCallback, useRef } from 'react';
import type { CallbackRef } from '../types';

/**
 * `useCallbackRef` manages a DOM node reference, allowing effects (like event
 * listeners) to be attached when the node is available and detached on cleanup.
 *
 * It's particularly useful when the logic for attaching/detaching effects
 * depends on external state or props. If these dependencies change, this hook
 * ensures that the old effects are cleaned up and new effects (with the updated
 * logic) are applied.
 *
 * @remarks
 * Core Behavior & Regeneration Flow:
 * 1. Memoized Ref Callback: `setNodeRef` (the ref callback) is memoized by
 *    `useCallback`. Its identity is key.
 * 2. Ref Callback Identity Change: `setNodeRef`'s identity changes *only if*
 *    `attachToNode` or `detachFromNode` functions change their identities.
 * 3. DOM Node Instance Change (with Stable Ref Callback Identity):
 *    If the DOM node itself changes (e.g., mount/unmount) while `setNodeRef`'s
 *    identity is stable, the `if (nodeRef.current !== node)` block handles:
 *    a. Detach from Old Node: Calling `detachFromNode` on the old node.
 *    b. Attach to New Node: Calling `attachToNode` on the new node.
 * 4. React's Handling of Ref Callback Identity Change:
 *    When `setNodeRef`'s identity changes (due to point 2), React executes a
 *    sequence:
 *    a. Detach with Old Logic: The *previous* `setNodeRef` is called with
 *       `null`, triggering `detachFromNode` with the *previous* `detachFromNode`
 *       logic.
 *    b. Attach with New Logic: The *new* `setNodeRef` is called with the
 *       current DOM node, triggering `attachToNode` with the *new* `attachToNode`
 *       logic.
 *
 * This "detach-then-attach" cycle (point 4) is triggered by changes to
 * `attachToNode` or `detachFromNode`.
 *
 * Note on Ref Callback Stability:
 * This hook is designed such that changes to the `attachToNode` or
 * `detachFromNode` functions *will* result in a new ref callback (`setNodeRef`)
 * instance.
 * This, in turn, causes React to perform the detach/attach sequence described
 * in point 4. This behavior is intentional to facilitate re-initialization of
 * effects when their underlying logic or dependencies change.
 * This hook does not aim to provide a ref callback with a persistently stable
 * identity if its input functions change; a different hook pattern would be
 * needed for that specific behavior.
 *
 * @example
 *   ```
 *   // ... (example as before) ...
 *   const [configId, setConfigId] = useState('A');
 *
 *   const attach = useCallback((node: HTMLElement) => {
 *     // Attaches listeners or effects specific to `configId`
 *     console.log(`Attaching with config: ${configId}`, node);
 *   }, [configId]);
 *
 *   const detach = useCallback((node: HTMLElement) => {
 *     // Detaches listeners or effects specific to `configId`
 *     console.log(`Detaching with config: ${configId}`, node);
 *   }, [configId]);
 *
 *   const myRef = useCallbackRef<HTMLElement>(attach, detach);
 *
 *   return <div ref={myRef}>Content</div>;
 *   ```
 *
 * @template T - The type of the DOM element. Must extend `Element`.
 *
 * @param attachToNode
 *   Function to execute when the node is mounted or when
 *   `attachToNode`/`detachFromNode` functions change identity.
 *   Responsible for setting up effects.
 *
 * @param detachFromNode
 *   Function to execute when the node is unmounted, the referenced node
 *   changes, or when `attachToNode`/`detachFromNode` functions change identity.
 *   Responsible for cleaning up effects.
 *
 * @returns A callback ref function to be passed to a JSX element's `ref` prop.
 */
export const useCallbackRef = <T extends Element>(
  attachToNode: (node: T) => void,
  detachFromNode: (node: T) => void,
): CallbackRef<T> => {
  // Stores the current DOM node instance.
  const nodeRef = useRef<T | null>(null);

  /**
   * 1. `setNodeRef` (the ref callback) is memoized by `useCallback`.
   * 2. Its identity changes if `attachToNode` or `detachFromNode` change.
   *    (See JSDoc @remarks point 4 for React's handling of this change).
   */
  const setNodeRef = useCallback(
    (node: T | null) => {
      // Called by React with the DOM node or null.

      /**
       * This 'if' block is entered if the incoming `node` from React differs
       * from `nodeRef.current`.
       * This handles two main scenarios (see JSDoc @remarks for full detail):
       * 3. Actual DOM node instance changes (mount/unmount/replacement).
       * 4. Part of React's detach/attach sequence when `setNodeRef` identity
       *    changes.
       */
      if (nodeRef.current !== node) {
        /**
         * Detach from the previous node if it exists.
         * 3a. If node instance changed, this cleans up the previous node.
         * 4a. If `setNodeRef` identity changed, this is the old_ref(null) call
         *     running old detach logic.
         */
        if (nodeRef.current) {
          detachFromNode(nodeRef.current);
        }

        // Update the stored node reference.
        nodeRef.current = node;

        /**
         * Attach to the new node if it exists.
         * 3b. If node instance changed (or initial mount), this sets up the
         *     new/current node.
         * 4b. `setNodeRef` identity changed, this is the new_ref(node) call
         *     running new attach logic.
         */
        if (node) {
          attachToNode(node);
        }
      }
    },

    /**
     * 2. `setNodeRef`'s identity changes if `attachToNode` or `detachFromNode`
     *    change.
     * 4. This identity change triggers React's ref update sequence:
     *    4a. old_ref(null) called (detaches with old logic).
     *    4b. new_ref(node) called (attaches with new logic).
     */
    [attachToNode, detachFromNode],
  );

  return setNodeRef;
};
