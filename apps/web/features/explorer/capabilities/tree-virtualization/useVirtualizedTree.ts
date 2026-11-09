'use client';

import { useRef, type RefObject } from 'react';
import {
  useTreeView,
  type TreeNode,
  type UseTreeViewProps,
} from '@ark-ui/react/tree-view';

/** Ark's keyboard-scroll callback, shared with the isolated viewport. */
export type TreeScrollHandler<T extends TreeNode> = NonNullable<
  UseTreeViewProps<T>['scrollToIndexFn']
>;

/**
 * Creates one Ark tree and connects its keyboard scrolling to a virtual viewport.
 *
 * @param props - Ark tree options; this capability owns scrollToIndexFn.
 * @returns The Ark model and a ref for the viewport's keyboard-scroll callback.
 */
export function useVirtualizedTree<T extends TreeNode>(
  props: Omit<UseTreeViewProps<T>, 'scrollToIndexFn'>,
) {
  const scrollToIndexRef = useRef<TreeScrollHandler<T> | null>(null);
  const tree = useTreeView<T>({
    ...props,
    scrollToIndexFn(details) {
      scrollToIndexRef.current?.(details);
    },
  });

  return {
    /** Owner-created Ark model supplying the collection and interaction state. */
    tree,
    /**
     * Owner-created callback ref used by Ark's scrollToIndexFn. The mounted
     * viewport publishes its index-scroll function here and clears it on unmount.
     */
    scrollToIndexRef,
  };
}

export type VirtualizedTree<T extends TreeNode> = ReturnType<
  typeof useVirtualizedTree<T>
>;

/**
 * Scrolls an expanded tree entry into view without changing selection or focus.
 * Call after ancestor expansion has committed; the caller owns scheduling.
 *
 * @param options - Ark model, viewport refs and the entry identity to reveal.
 * @returns Nothing; missing visible entries or scroll handlers are ignored.
 */
export function scrollVisibleTreeEntryIntoView<T extends TreeNode>({
  tree,
  scrollToIndexRef,
  viewportElementRef,
  entryId,
}: VirtualizedTree<T> & {
  viewportElementRef: RefObject<HTMLDivElement | null>;
  entryId: string;
}): void {
  for (const [index, { node, indexPath }] of tree.getVisibleNodes().entries()) {
    if (tree.collection.getNodeValue(node) !== entryId) continue;
    scrollToIndexRef.current?.({
      index,
      node,
      indexPath,
      getElement: () =>
        viewportElementRef.current?.querySelector<HTMLElement>(
          `[data-value="${CSS.escape(entryId)}"]`,
        ) ?? null,
    });
    return;
  }
}
