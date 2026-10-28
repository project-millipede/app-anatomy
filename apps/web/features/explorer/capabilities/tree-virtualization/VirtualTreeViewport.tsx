'use client';

import type { ReactNode } from 'react';
import { TreeView, type TreeNode } from '@ark-ui/react/tree-view';
import type { VirtualizedTree } from './useVirtualizedTree';
import { useTreeViewport } from './useTreeViewport';
import { groupMountedTreeRows, type VisibleTreeRow } from './visibleTree';
import styles from './VirtualTreeViewport.module.css';

/** The owner-created Ark model and the presentation contract for its viewport. */
type VirtualTreeViewportProps<T extends TreeNode> = VirtualizedTree<T> & {
  /** Classes applied to the inner TreeView.Tree element alongside positioning styles. */
  className: string;
  /** Space-separated instruction element IDs used by the tree's aria-describedby. */
  describedBy: string;
  /**
   * Exact interactive-row border-box height in CSS pixels; must match rendered
   * row styles.
   */
  rowHeight: number;
  /**
   * Uniform tree inset in CSS pixels; must match the inner tree's styles.
   * Included in the virtual extent, top-level offsets and keyboard-scroll alignment.
   */
  padding: number;
  /**
   * Supplies feature-specific Ark node markup independently of virtual positioning.
   * The renderer supplies NodeProvider with the row's node and indexPath, then
   * renders children inside BranchContent for folders and ignores them for files.
   *
   * @param row - The retained node, collection path and complete sibling metadata.
   * @param children - The reserved-height group of positioned direct descendants.
   * @returns The Ark branch/item presentation for this retained row.
   */
  renderNode: (row: VisibleTreeRow<T>, children: ReactNode) => ReactNode;
};

/**
 * Windows a tree while retaining genuine nested branch and child-group markup.
 * Each child group reserves its complete expanded height. Mounted children use
 * offsets within that group, so omitted rows need no spacer instruction model.
 *
 * @param props - The Ark owner, sizing contract and feature-specific node renderer.
 * @returns One scroll container with the viewport rows and their real ancestors.
 */
export function VirtualTreeViewport<T extends TreeNode>({
  tree,
  scrollToIndexRef,
  className,
  describedBy,
  rowHeight,
  padding,
  renderNode,
}: VirtualTreeViewportProps<T>) {
  const { index, viewportRef, virtualizer } = useTreeViewport({
    tree,
    scrollToIndexRef,
    rowHeight,
    padding,
  });
  const mountedGroups = groupMountedTreeRows(
    index,
    virtualizer.getVirtualItems().map((item) => item.index),
  );

  /**
   * Positions retained direct children within their parent's expanded extent.
   *
   * @param parentRowIndex - The parent row, or null for the collection root.
   * @returns The retained sibling nodes with recursively positioned child slots.
   */
  function renderChildren(parentRowIndex: number | null): ReactNode {
    const firstChildIndex = parentRowIndex === null ? 0 : parentRowIndex + 1;
    return mountedGroups.get(parentRowIndex)?.map((row) => (
      <div
        key={row.value}
        className={styles.node}
        style={{
          insetBlockStart:
            (row.rowIndex - firstChildIndex) * rowHeight +
            (parentRowIndex === null ? padding : 0),
          insetInline: parentRowIndex === null ? padding : 0,
        }}
      >
        {renderNode(
          row,
          <div
            className={styles.group}
            style={{
              blockSize: (row.subtreeEndIndex - row.rowIndex - 1) * rowHeight,
            }}
          >
            {renderChildren(row.rowIndex)}
          </div>,
        )}
      </div>
    ));
  }

  return (
    <div ref={viewportRef} className={styles.viewport}>
      <TreeView.Tree
        className={`${className} ${styles.tree}`}
        aria-describedby={describedBy}
        style={{ blockSize: virtualizer.getTotalSize() }}
      >
        {renderChildren(null)}
      </TreeView.Tree>
    </div>
  );
}
