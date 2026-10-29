import { createTreeCollection } from '@ark-ui/react/tree-view';
import previewData from './previewData.generated.json';

/** Rust-generated synthetic records; no native files are acquired by this preview. */
export const previewDatasets = previewData.datasets;
export type PreviewDataset = (typeof previewDatasets)[number];
export type PreviewEntry = PreviewDataset['entries'][number];
export type PreviewRelationship = PreviewDataset['relationships'][number];
export type PreviewNeighborhood = PreviewDataset['neighborhoods'][number];
export type PreviewConnection = PreviewNeighborhood['west'][number];

/** Ark's presentation tree, built from the generated physical inventory. */
export interface PreviewNode {
  id: string;
  name: string;
  kind?: string;
  path?: string;
  children?: PreviewNode[];
}

export function createPreviewInventory(dataset: PreviewDataset) {
  const nodes = new Map<string, PreviewNode>(
    dataset.entries.map((entry) => [entry.id, { ...entry }]),
  );
  const rootNode: PreviewNode = { id: 'preview-root', name: '', children: [] };
  for (const entry of dataset.entries) {
    const parent = entry.parentId ? nodes.get(entry.parentId) : rootNode;
    const node = nodes.get(entry.id)!;
    if (parent) (parent.children ??= []).push(node);
  }
  return createTreeCollection<PreviewNode>({
    nodeToValue: (node) => node.id,
    nodeToString: (node) => node.name,
    rootNode,
  });
}

export const previewInventory = createPreviewInventory(previewDatasets[0]!);
export const defaultPreviewSelectionId = previewDatasets[0]!.initialEntryId;
