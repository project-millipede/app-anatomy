'use client';

import { useId, type RefObject, type ReactNode } from 'react';
import { TreeView } from '@ark-ui/react/tree-view';
import type { VirtualizedTree } from './capabilities/tree-virtualization/useVirtualizedTree';
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
  viewportElementRef,
  roles,
  activeEndpointIds,
  hiddenCounts,
  datasetSelector,
  description,
  summary,
}: VirtualizedTree<PreviewNode> & {
  viewportElementRef: RefObject<HTMLDivElement | null>;
  datasetSelector: ReactNode;
  description?: ReactNode;
  summary?: ReactNode;
  roles: ReadonlyMap<string, { incoming: boolean; outgoing: boolean }>;
  activeEndpointIds: ReadonlySet<string>;
  hiddenCounts: ReadonlyMap<string, number>;
}) {
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
            {datasetSelector}
          </div>
        }
        description={
          description === null ? null : (
            <p id={hintId} className={styles.treeHint}>
              {description ?? (
                <>
                  SEL center · IN source · OUT target/candidate. Outline: active
                  endpoint. +count: collapsed related entries.
                </>
              )}
            </p>
          )
        }
        tree={
          <VirtualTreeViewport
            tree={tree}
            scrollToIndexRef={scrollToIndexRef}
            className={parts.tree}
            describedBy={hintId}
            rowHeight={32}
            padding={3}
            viewportElementRef={viewportElementRef}
            renderNode={(row, children) => {
              const role = roles.get(row.value);
              return (
                <ExplorerTreeNode
                  node={row.node}
                  indexPath={row.indexPath}
                  siblingCount={row.siblingCount}
                  relationRole={
                    role?.incoming
                      ? role.outgoing
                        ? 'inout'
                        : 'in'
                      : role?.outgoing
                        ? 'out'
                        : undefined
                  }
                  activeEndpoint={activeEndpointIds.has(row.value)}
                  hiddenCount={hiddenCounts.get(row.value) ?? 0}
                >
                  {children}
                </ExplorerTreeNode>
              );
            }}
          />
        }
        footer={
          <p
            id={description === null ? hintId : undefined}
            className={styles.treeSummary}
          >
            {summary ?? `${roles.size} related resources · No files inspected`}
          </p>
        }
      />
    </TreeView.RootProvider>
  );
}
