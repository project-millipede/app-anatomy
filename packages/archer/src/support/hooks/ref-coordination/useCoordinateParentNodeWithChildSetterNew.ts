import { useCallback, useRef } from 'react';

export type NodeSetter<TNode extends HTMLElement = HTMLElement> = (
  node: TNode | null,
) => void;

export type UseCoordinateParentNodeWithChildSetterReturn<
  TParentElement extends HTMLElement,
  TChildNode extends HTMLElement = HTMLElement,
> = [
  /** Attach this to the parent’s DOM element. React calls it with node/null. */
  (node: TParentElement | null) => void,
  /**
   * Give this to the child. The child calls with its NodeSetter when ready,
   * or with null on unmount.
   */
  (childSetter: NodeSetter<TChildNode> | null) => void,
];

/**
 * Ref–handshake without state:
 * - Parent attaches a stable ref callback to its element.
 * - Child provides a stable setter via `onChildSetterReady`.
 * - We immediately wire current parent node → latest child setter, and
 *   call the previous setter with `null` on replace/unmount.
 *
 * No `setState`, so no renders caused by the handshake itself.
 */
export function useCoordinateParentNodeWithChildSetter<
  TParentElement extends HTMLElement,
  TChildNode extends HTMLElement = HTMLElement,
>(): UseCoordinateParentNodeWithChildSetterReturn<TParentElement, TChildNode> {
  const parentNodeRef = useRef<TParentElement | null>(null);
  const childSetterRef = useRef<NodeSetter<TChildNode> | null>(null);

  // Parent’s ref callback: always forwards current node to current child setter.
  const callbackRefForParentNode = useCallback(
    (node: TParentElement | null) => {
      parentNodeRef.current = node;
      const setter = childSetterRef.current;
      if (setter) {
        // forward node (or null) to the child’s setter
        setter(node as unknown as TChildNode | null);
      }
    },
    [],
  );

  // Child announces (or clears) its setter. We detach the old one, then attach the new one.
  const onChildSetterReady = useCallback(
    (nextSetter: NodeSetter<TChildNode> | null) => {
      const prevSetter = childSetterRef.current;

      // 1) If there was a previous setter, detach it from the current parent node.
      if (prevSetter) {
        prevSetter(null);
      }

      // 2) Store the new setter.
      childSetterRef.current = nextSetter;

      // 3) If we have a parent node and a new setter, attach it immediately.
      if (nextSetter && parentNodeRef.current) {
        nextSetter(parentNodeRef.current as unknown as TChildNode);
      }
    },
    [],
  );

  return [callbackRefForParentNode, onChildSetterReady];
}
