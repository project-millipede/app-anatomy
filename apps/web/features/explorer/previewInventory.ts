import { createTreeCollection } from '@ark-ui/react/tree-view';
import previewData from './previewData.generated.json';

/** Rust-generated synthetic records; no native files are acquired by this preview. */
export const previewDatasets = previewData.datasets;
export type PreviewDataset = (typeof previewDatasets)[number];
export type PreviewEntry = PreviewDataset['entries'][number];
export type PreviewRelationship = PreviewDataset['relationships'][number];
export type PreviewNeighborhood = PreviewDataset['neighborhoods'][number];
export type PreviewConnection = PreviewNeighborhood['west'][number];

/** Selected context type inferred from the generated records returned by the lookup. */
export type PreviewContext = ReturnType<typeof getPreviewContext>;

/** Non-null byte composition inferred from generated rows without copying their fields. */
export type PreviewFileByteLayout = PreviewDataset extends {
  architectureCoverage: { binaries: readonly { byteLayout: infer Layout }[] };
}
  ? NonNullable<Layout>
  : never;

/**
 * Find a recorded CPU identity without deriving its label from a numeric key.
 * @param dataset Generated architecture coverage containing the recorded identity.
 * @param architectureId Exact CPU identity supplied with an image region.
 * @returns The recorded architecture; throws when its required record is missing.
 */
export function getPreviewArchitecture(
  dataset: Pick<PreviewDataset, 'architectureCoverage'>,
  architectureId: string,
) {
  const architecture = dataset.architectureCoverage.architectures.find(
    (recorded) => recorded.id === architectureId,
  );
  if (!architecture) {
    throw new Error(`Explorer architecture is missing: ${architectureId}`);
  }
  return architecture;
}

/**
 * Find an authored exploration context without substituting a default.
 * @param dataset Generated records containing the selectable contexts.
 * @param contextId Identifier selected by the workspace owner.
 * @returns The recorded context; throws when the required record is missing.
 */
export function getPreviewContext(
  dataset: Pick<PreviewDataset, 'contexts'>,
  contextId: string,
) {
  const context = dataset.contexts.find((value) => value.id === contextId);
  if (!context) throw new Error(`Explorer context is missing: ${contextId}`);
  return context;
}

/**
 * Find a physical entry without following aliases or references.
 * @param entries Generated inventory entries to search.
 * @param entryId Inventory-scoped entry identifier.
 * @returns The recorded entry; throws when the required record is missing.
 */
export function getPreviewEntry(
  entries: readonly PreviewEntry[],
  entryId: string,
): PreviewEntry {
  const entry = entries.find((value) => value.id === entryId);
  if (!entry) throw new Error(`Explorer entry is missing: ${entryId}`);
  return entry;
}

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
