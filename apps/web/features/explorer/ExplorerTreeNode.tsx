import type { MouseEvent, ReactNode } from 'react';
import { TreeView, useTreeViewContext } from '@ark-ui/react/tree-view';
import { tree as treeRecipe } from '../../styled-system/recipes';
import type { PreviewNode } from './previewInventory';

const parts = treeRecipe();

type ExplorerTreeNodeProps = TreeView.NodeProviderBaseProps<PreviewNode> & {
  /** Total authored siblings, including rows outside the mounted window. */
  siblingCount: number;
  /** Nested children positioned by the viewport. */
  children: ReactNode;
};

/**
 * Renders one Explorer node using Ark's interaction state and nested markup.
 *
 * @param props - The node, collection path, complete sibling count and child slot.
 * @returns The folder or file row, including its existing connector gutter.
 */
export function ExplorerTreeNode({
  node,
  indexPath,
  siblingCount,
  children,
}: ExplorerTreeNodeProps) {
  const positionInSet = indexPath[indexPath.length - 1]! + 1;
  const isLastSibling = positionInSet === siblingCount;
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
          <TreeView.Branch
            className={parts.branch}
            aria-label={node.name}
            aria-posinset={positionInSet}
            aria-setsize={siblingCount}
          >
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
              {children}
            </TreeView.BranchContent>
          </TreeView.Branch>
        ) : (
          <TreeView.Item
            className={parts.item}
            aria-posinset={positionInSet}
            aria-setsize={siblingCount}
          >
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
