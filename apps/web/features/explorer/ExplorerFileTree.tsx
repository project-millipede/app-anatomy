'use client';

import { useId, type ReactNode } from 'react';
import { TreeView } from '@ark-ui/react/tree-view';
import type { VirtualizedTree } from './capabilities/tree-virtualization/useVirtualizedTree';
import type { VisibleTreeRow } from './capabilities/tree-virtualization/visibleTree';
import { VirtualTreeViewport } from './capabilities/tree-virtualization/VirtualTreeViewport';
import { ExplorerTreeNode } from './ExplorerTreeNode';
import { tree as treeRecipe } from '../../styled-system/recipes';
import type { PreviewNode } from './previewInventory';
import { NavigationPane } from './layout/NavigationPane';
import styles from './ExplorerLayout.module.css';

const parts = treeRecipe();

export function ExplorerFileTree({
  tree,
  scrollToIndexRef,
}: VirtualizedTree<PreviewNode>) {
  const hintId = useId();
  return (
    <TreeView.RootProvider
      value={tree}
      className={parts.root}
      // Defer mounting branch contents until the branch is first expanded.
      lazyMount
      // Remove branch contents from the DOM when the branch collapses.
      unmountOnExit
    >
      <NavigationPane
        heading={
          <div className={styles.treeHeading}>
            <TreeView.Label asChild className={parts.label}>
              <h2>Files</h2>
            </TreeView.Label>
            <span className={styles.muted}>Preview inventory</span>
          </div>
        }
        description={
          <p id={hintId} className={styles.treeHint}>
            Select a row to update the center card. Folder rows also open their
            children. Chevrons expand or collapse without selecting.
          </p>
        }
        tree={
          <VirtualTreeViewport
            tree={tree}
            scrollToIndexRef={scrollToIndexRef}
            className={parts.tree}
            describedBy={hintId}
            rowHeight={32}
            padding={3}
            renderNode={renderPreviewNode}
          />
        }
        footer={
          <p className={styles.treeSummary}>
            Authored nodes · No files inspected
          </p>
        }
      />
    </TreeView.RootProvider>
  );
}

/**
 * Supplies Explorer-specific node presentation to the virtual viewport.
 *
 * @param row - Ark node metadata from the current expanded sequence.
 * @param children - The positioned direct descendants for this node.
 * @returns The existing Explorer folder/file presentation.
 */
function renderPreviewNode(
  row: VisibleTreeRow<PreviewNode>,
  children: ReactNode,
) {
  return (
    <ExplorerTreeNode
      node={row.node}
      indexPath={row.indexPath}
      siblingCount={row.siblingCount}
    >
      {children}
    </ExplorerTreeNode>
  );
}
