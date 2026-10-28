'use client';

import type { UseTreeViewReturn } from '@ark-ui/react/tree-view';
import { useVirtualizedTree } from './capabilities/tree-virtualization/useVirtualizedTree';
import { ExplorerConnectionInspector } from './ExplorerConnectionInspector';
import { ExplorerFileTree } from './ExplorerFileTree';
import { ExplorerRelationshipCanvas } from './ExplorerRelationshipCanvas';
import { ExplorerWorkspaceLayout } from './layout/ExplorerWorkspaceLayout';
import {
  defaultPreviewSelectionId,
  previewInventory,
  type PreviewNode,
} from './previewInventory';

/**
 * Resolves the selected preview node and its display path through the tree.
 * Uses the selection prompt when no selected node can be found.
 *
 * @param tree - The preview tree's collection and current selected node IDs.
 * @returns The selected node (if found) and its path or selection prompt.
 */
function getPreviewSelection({
  collection,
  selectedValue,
}: Pick<UseTreeViewReturn<PreviewNode>, 'collection' | 'selectedValue'>) {
  const [selectedNodeId] = selectedValue;
  const selectedNode = selectedNodeId
    ? collection.findNode(selectedNodeId)
    : undefined;
  const selectedPath = selectedNode
    ? [...collection.getParentNodes(selectedNode.id), selectedNode]
        .map((node) => node.name)
        .join(' / ')
    : 'Choose a preview resource';

  return { selectedNode, selectedPath };
}

/** Own the preview selection and supply each named workspace pane. */
export function ExplorerWorkspace() {
  const { tree, scrollToIndexRef } = useVirtualizedTree({
    collection: previewInventory,
    selectionMode: 'single',
    expandOnClick: false,
    defaultSelectedValue: [defaultPreviewSelectionId],
    defaultExpandedValue: previewInventory
      .getParentNodes(defaultPreviewSelectionId)
      .map((node) => node.id),
  });
  const { selectedNode, selectedPath } = getPreviewSelection(tree);

  return (
    <ExplorerWorkspaceLayout
      navigation={
        <ExplorerFileTree tree={tree} scrollToIndexRef={scrollToIndexRef} />
      }
      canvas={
        <ExplorerRelationshipCanvas
          selectedName={selectedNode?.name}
          selectedPath={selectedPath}
        />
      }
      inspector={<ExplorerConnectionInspector />}
    />
  );
}
