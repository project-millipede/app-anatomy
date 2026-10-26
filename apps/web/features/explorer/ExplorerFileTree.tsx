'use client';

import { useId, type MouseEvent } from 'react';
import {
  TreeView,
  useTreeViewContext,
  type UseTreeViewReturn,
} from '@ark-ui/react/tree-view';
import { tree as treeRecipe } from '../../styled-system/recipes';
import type { PreviewNode } from './previewInventory';
import styles from './ExplorerLayout.module.css';

const parts = treeRecipe();

export function ExplorerFileTree({
  tree,
}: {
  tree: UseTreeViewReturn<PreviewNode>;
}) {
  const hintId = useId();
  return (
    <aside className={styles.sidebar} aria-label="File navigation">
      <TreeView.RootProvider value={tree} className={parts.root}>
        <div className={styles.panelHeader}>
          <TreeView.Label asChild className={parts.label}>
            <h2>Files</h2>
          </TreeView.Label>
          <span className={styles.muted}>Preview inventory</span>
        </div>
        <p id={hintId} className={styles.treeHint}>
          Select a row to update the center card. Folder rows also open their
          children. Chevrons expand or collapse without selecting.
        </p>
        <div className={styles.treeBody}>
          <TreeView.Tree className={parts.tree} aria-describedby={hintId}>
            {tree.collection.rootNode.children?.map((node, index, siblings) => (
              <FileTreeNode
                key={node.id}
                node={node}
                indexPath={[index]}
                isLastSibling={index === siblings.length - 1}
              />
            ))}
          </TreeView.Tree>
        </div>
        <div className={styles.sidebarFooter}>
          <p>Authored nodes · No files inspected</p>
        </div>
      </TreeView.RootProvider>
    </aside>
  );
}

type FileTreeNodeProps = TreeView.NodeProviderBaseProps<PreviewNode> & {
  isLastSibling: boolean;
};

function FileTreeNode({ node, indexPath, isLastSibling }: FileTreeNodeProps) {
  const tree = useTreeViewContext();
  const state = tree.getNodeState({ node, indexPath });

  /**
   * Opens a folder on an eligible row click without toggling it closed.
   * Ark handles selection; the chevron separately toggles expansion.
   *
   * @param event - The click received by the branch control.
   * @returns No value.
   */
  function handleBranchControlClick(event: MouseEvent<HTMLDivElement>): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      state.disabled ||
      state.loading
    )
      return;

    tree.expand([node.id]);
  }

  return (
    <TreeView.NodeProvider node={node} indexPath={indexPath}>
      <div
        className={parts.node}
        data-root={indexPath.length === 1 ? '' : undefined}
        data-last={isLastSibling ? '' : undefined}
        data-leaf={state.isBranch ? undefined : ''}
      >
        <span
          className={parts.connector}
          data-tree-connector=""
          aria-hidden="true"
        />
        {state.isBranch ? (
          <TreeView.Branch className={parts.branch} aria-label={node.name}>
            <TreeView.BranchControl
              className={parts.branchControl}
              aria-label={node.name}
              onClick={handleBranchControlClick}
            >
              <TreeView.BranchTrigger
                className={parts.branchTrigger}
                aria-label={`Toggle ${node.name}`}
              >
                <TreeView.BranchIndicator className={parts.branchIndicator}>
                  <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path
                      d="m4 2 4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  </svg>
                </TreeView.BranchIndicator>
              </TreeView.BranchTrigger>
              <span className={parts.content} data-tree-content="">
                <NodeIcon kind="folder" />
                <TreeView.BranchText
                  className={parts.branchText}
                  title={node.name}
                >
                  {node.name}
                </TreeView.BranchText>
              </span>
            </TreeView.BranchControl>
            <TreeView.BranchContent className={parts.branchContent}>
              {node.children?.map((child, index, siblings) => (
                <FileTreeNode
                  key={child.id}
                  node={child}
                  indexPath={[...indexPath, index]}
                  isLastSibling={index === siblings.length - 1}
                />
              ))}
            </TreeView.BranchContent>
          </TreeView.Branch>
        ) : (
          <TreeView.Item className={parts.item}>
            <span className={parts.disclosureSpacer} aria-hidden="true" />
            <span className={parts.content} data-tree-content="">
              <NodeIcon kind="file" />
              <TreeView.ItemText className={parts.itemText} title={node.name}>
                {node.name}
              </TreeView.ItemText>
            </span>
          </TreeView.Item>
        )}
      </div>
    </TreeView.NodeProvider>
  );
}

const nodeIconPaths = {
  folder: 'M1.5 4V2.5h4L7 4h7.5v9.5h-13Z',
  file: 'M4 1.5h5L12.5 5v9.5H4Zm5 0V5h3.5',
} as const;

function NodeIcon({ kind }: { kind: keyof typeof nodeIconPaths }) {
  return (
    <span className={parts.icon} aria-hidden="true">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d={nodeIconPaths[kind]} />
      </svg>
    </span>
  );
}
