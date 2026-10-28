'use client';

import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type RefObject,
} from 'react';
import type { TreeNode, UseTreeViewReturn } from '@ark-ui/react/tree-view';
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
} from '@tanstack/react-virtual';
import { createVisibleTreeIndex } from './visibleTree';
import type { TreeScrollHandler } from './useVirtualizedTree';

type TreeViewportOptions<T extends TreeNode> = {
  /** Owner-created Ark model supplying the collection and interaction state. */
  tree: UseTreeViewReturn<T>;
  /**
   * Callback bridge invoked by Ark for index-based scrolling. The viewport
   * installs its handler while mounted and clears it on unmount.
   */
  scrollToIndexRef: RefObject<TreeScrollHandler<T> | null>;
  /**
   * Exact interactive-row border-box height in CSS pixels; must match the
   * rendered row styles.
   */
  rowHeight: number;
  /**
   * Uniform tree inset in CSS pixels; must match the tree's styles. Included
   * in the virtual extent, top-level offsets and keyboard-scroll alignment.
   */
  padding: number;
};

/**
 * Windows Ark's expanded rows and connects its keyboard scrolling to the viewport.
 *
 * The visible-row index is cached by collection identity and expanded values.
 * Ark creates a new API object and expansion array on focus or selection updates;
 * those identities must not invalidate the row index or the virtual item keys.
 * Replace the collection when its contents change. Serializing expanded IDs is
 * proportional to the expanded-folder count; rebuilding the index is proportional
 * to the expanded row count and happens only when those topology inputs change.
 * Ark's own keyboard traversal can still scan its collection independently.
 *
 * @param options - The sole Ark model, keyboard callback ref and fixed row/inset
 * geometry for this mounted viewport.
 * @returns The cached row index, scroll-element ref and TanStack virtualizer.
 */
export function useTreeViewport<T extends TreeNode>({
  tree,
  scrollToIndexRef,
  rowHeight,
  padding,
}: TreeViewportOptions<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { collection } = tree;
  const expansionKey = JSON.stringify(tree.expandedValue);
  const { index, getItemKey, initialTabStopIndex } = useMemo(() => {
    const index = createVisibleTreeIndex(collection, tree.getVisibleNodes());
    return {
      index,
      getItemKey: (rowIndex: number) => index.rows[rowIndex]!.value,
      initialTabStopIndex: index.rows.findIndex(
        ({ node }) => !collection.getNodeDisabled(node),
      ),
    };
    // In the pinned Ark implementation, visible nodes depend on these topology
    // inputs, not the changing API object or its getVisibleNodes function.
  }, [collection, expansionKey]);

  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      const viewport = viewportRef.current;
      const activeElement = viewport?.ownerDocument.activeElement;
      const activeRow =
        activeElement && viewport?.contains(activeElement)
          ? activeElement.closest<HTMLElement>(
              '[data-part="branch-control"], [data-part="item"]',
            )
          : null;
      const focusedRow =
        activeRow ??
        viewport?.querySelector<HTMLElement>(
          '[data-part="branch-control"][tabindex="0"], [data-part="item"][tabindex="0"]',
        );
      const focusedValue = focusedRow?.dataset.value;
      const focusedIndex =
        focusedValue === undefined
          ? undefined
          : index.indexByValue.get(focusedValue);
      const tabStopIndex =
        focusedIndex !== undefined &&
        !collection.getNodeDisabled(index.rows[focusedIndex]!.node)
          ? focusedIndex
          : initialTabStopIndex;

      // Keep Ark's mounted roving tab stop even while browser focus is outside
      // the tree. Otherwise scrolling could remove its only keyboard entry.
      // This inspects bounded mounted DOM, not every collection row. A previous
      // pin can remain until the next range change after focus moves.
      if (tabStopIndex >= 0 && !indexes.includes(tabStopIndex)) {
        indexes.push(tabStopIndex);
        indexes.sort((left, right) => left - right);
      }
      return indexes;
    },
    [collection, index, initialTabStopIndex],
  );

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: index.rows.length,
    getScrollElement: () => viewportRef.current,
    getItemKey,
    estimateSize: () => rowHeight,
    paddingStart: padding,
    paddingEnd: padding,
    scrollPaddingStart: padding,
    scrollPaddingEnd: padding,
    overscan: 8,
    rangeExtractor,
    // Commit native scroll windows before Ark's next-frame focus attempt.
    useFlushSync: true,
  });

  useImperativeHandle(
    scrollToIndexRef,
    (): TreeScrollHandler<T> =>
      ({ index }) => {
        virtualizer.scrollToIndex(index, {
          align: 'auto',
          behavior: 'instant',
        });
      },
    [virtualizer],
  );

  return { index, viewportRef, virtualizer };
}
