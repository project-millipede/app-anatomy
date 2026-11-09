'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  scrollVisibleTreeEntryIntoView,
  useVirtualizedTree,
} from './capabilities/tree-virtualization/useVirtualizedTree';
import { ExplorerConnectionInspector } from './ExplorerConnectionInspector';
import { ExplorerFileTree } from './ExplorerFileTree';
import { ExplorerRelationshipCanvas } from './ExplorerRelationshipCanvas';
import { ExplorerWorkspaceLayout } from './layout/ExplorerWorkspaceLayout';
import {
  createPreviewInventory,
  previewDatasets,
  type PreviewConnection,
  type PreviewDataset,
} from './previewInventory';
import { collapsedRelatedCounts } from './treePresentation';
import styles from './ExplorerLayout.module.css';

type Preview = { relationshipId: string; candidateId: string | null };
type HistoryEntry = {
  entryId: string;
  contextId: string;
  preview: Preview | null;
  expandedIds: string[];
  scrollTop: number;
};

/** Dataset changes reset only this synthetic presentation, which has no native owner. */
export function ExplorerWorkspace() {
  const [datasetId, setDatasetId] = useState(previewDatasets[0]!.id);
  const dataset = previewDatasets.find((value) => value.id === datasetId)!;
  const datasetSelector = (
    <label className={styles.selectLabel}>
      Synthetic dataset
      <select
        value={datasetId}
        onChange={(event) => setDatasetId(event.target.value)}
      >
        {previewDatasets.map((value) => (
          <option key={value.id} value={value.id}>
            {value.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <DatasetWorkspace
      key={dataset.id}
      dataset={dataset}
      datasetSelector={datasetSelector}
    />
  );
}

/** Ark owns current tree state; React owns connection preview and navigation history. */
function DatasetWorkspace({
  dataset,
  datasetSelector,
}: {
  dataset: PreviewDataset;
  datasetSelector: ReactNode;
}) {
  const collection = useMemo(() => createPreviewInventory(dataset), [dataset]);
  const [contextId, setContextId] = useState(dataset.initialContextId);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const viewportElementRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<
    { entryId: string } | { scrollTop: number } | null
  >(null);
  const restoringHistory = useRef(false);
  const suppressSelectionHistory = useRef(false);
  const { tree, scrollToIndexRef } = useVirtualizedTree({
    collection,
    selectionMode: 'single',
    expandOnClick: false,
    onSelectionChange: recordTreeNavigation,
    defaultSelectedValue: [dataset.initialEntryId],
    defaultExpandedValue: collection
      .getParentNodes(dataset.initialEntryId)
      .map((node) => node.id),
  });
  const [entryId] = tree.selectedValue;
  const selectedEntry = dataset.entries.find((entry) => entry.id === entryId);
  const neighborhood = dataset.neighborhoods.find(
    (value) => value.entryId === entryId && value.contextId === contextId,
  );
  const links = neighborhood
    ? [
        ...neighborhood.north,
        ...neighborhood.west,
        ...neighborhood.east,
        ...neighborhood.south,
      ]
    : [];
  const activeConnection = links.find(
    (value) => value.relationshipId === preview?.relationshipId,
  );
  const relationship = activeConnection
    ? dataset.relationships.find(
        (value) => value.id === activeConnection.relationshipId,
      )
    : undefined;
  const endpointIds = activeConnection?.endpointIds ?? [];
  const candidateId =
    preview?.candidateId && endpointIds.includes(preview.candidateId)
      ? preview.candidateId
      : null;
  const activeEndpointIds = new Set(candidateId ? [candidateId] : endpointIds);
  const roles = new Map(
    neighborhood?.roles.map((role) => [role.entryId, role]) ?? [],
  );
  const hiddenCounts = collapsedRelatedCounts(
    roles.keys(),
    tree.expandedValue,
    (id) => collection.getParentNodes(id).map((node) => node.id),
  );

  function recordTreeNavigation({
    selectedValue,
  }: {
    selectedValue: string[];
  }) {
    if (suppressSelectionHistory.current) {
      suppressSelectionHistory.current = false;
      return;
    }
    const [nextEntryId] = selectedValue;
    if (!entryId || nextEntryId === entryId) return;
    setHistory((current) => [
      ...current,
      {
        entryId,
        contextId,
        preview,
        expandedIds: [...tree.expandedValue],
        scrollTop: viewportElementRef.current?.scrollTop ?? 0,
      },
    ]);
  }

  function changeContext(nextContextId: string) {
    const nextNeighborhood = dataset.neighborhoods.find(
      (value) => value.entryId === entryId && value.contextId === nextContextId,
    );
    const nextLinks = nextNeighborhood
      ? [
          ...nextNeighborhood.north,
          ...nextNeighborhood.west,
          ...nextNeighborhood.east,
          ...nextNeighborhood.south,
        ]
      : [];
    const nextRelationship = relationship
      ? dataset.relationships.find(
          (value) =>
            value.originalId === relationship.originalId &&
            value.contextId === nextContextId &&
            nextLinks.some((link) => link.relationshipId === value.id),
        )
      : undefined;
    const nextConnection = nextLinks.find(
      (link) => link.relationshipId === nextRelationship?.id,
    );
    setPreview(
      nextConnection
        ? {
            relationshipId: nextConnection.relationshipId,
            candidateId:
              candidateId && nextConnection.endpointIds.includes(candidateId)
                ? candidateId
                : nextConnection.endpointIds.length === 1
                  ? nextConnection.endpointIds[0]!
                  : null,
          }
        : null,
    );
    setContextId(nextContextId);
    expandEndpoints(nextNeighborhood?.roles.map((role) => role.entryId) ?? []);
  }

  function expandEndpoints(ids: readonly string[]) {
    const ancestors = new Set(
      ids.flatMap((id) => collection.getParentNodes(id).map((node) => node.id)),
    );
    if (ancestors.size > 0) tree.expand([...ancestors]);
  }

  // A new center reveals related ancestors once. Manual collapse stays respected
  // until a later selection, context change or explicit preview.
  useEffect(() => {
    if (restoringHistory.current) {
      restoringHistory.current = false;
      return;
    }
    setPreview(null);
    expandEndpoints(neighborhood?.roles.map((role) => role.entryId) ?? []);
    // Ark is the owner; changing API object identities are not selection changes.
  }, [entryId]);

  // Scroll after Ark's expanded topology has committed. No DOM focus is changed.
  useLayoutEffect(() => {
    const request = pendingScroll.current;
    if (!request) return;
    const frame = requestAnimationFrame(() => {
      if (pendingScroll.current !== request) return;
      if ('scrollTop' in request) {
        if (viewportElementRef.current)
          viewportElementRef.current.scrollTop = request.scrollTop;
      } else {
        scrollVisibleTreeEntryIntoView({
          tree,
          scrollToIndexRef,
          viewportElementRef,
          entryId: request.entryId,
        });
      }
      pendingScroll.current = null;
    });
    return () => cancelAnimationFrame(frame);
  });

  function previewConnection(connection: PreviewConnection) {
    const onlyEndpoint =
      connection.endpointIds.length === 1 ? connection.endpointIds[0]! : null;
    pendingScroll.current = onlyEndpoint ? { entryId: onlyEndpoint } : null;
    setPreview({
      relationshipId: connection.relationshipId,
      candidateId: onlyEndpoint,
    });
    expandEndpoints(connection.endpointIds);
  }

  function chooseCandidate(id: string) {
    if (!activeConnection || !endpointIds.includes(id)) return;
    pendingScroll.current = { entryId: id };
    setPreview({
      relationshipId: activeConnection.relationshipId,
      candidateId: id,
    });
    expandEndpoints([id]);
  }

  function revealEndpoint() {
    if (!candidateId) return;
    pendingScroll.current = { entryId: candidateId };
    expandEndpoints([candidateId]);
    // A render also commits the scroll when every ancestor was already expanded.
    setPreview((current) => (current ? { ...current } : current));
  }

  function focusEndpoint() {
    if (!candidateId || !entryId || candidateId === entryId) return;
    pendingScroll.current = { entryId: candidateId };
    // Ark queues this change. Keep the preview until onSelectionChange records
    // the previous exploration; the new-center effect clears it afterward.
    tree.setSelectedValue([candidateId]);
  }

  function goBack() {
    const previous = history[history.length - 1];
    if (!previous) return;
    restoringHistory.current = previous.entryId !== entryId;
    suppressSelectionHistory.current = previous.entryId !== entryId;
    pendingScroll.current = { scrollTop: previous.scrollTop };
    setHistory((current) => current.slice(0, -1));
    setContextId(previous.contextId);
    setPreview(previous.preview);
    tree.setSelectedValue([previous.entryId]);
    tree.setExpandedValue(previous.expandedIds);
  }

  return (
    <ExplorerWorkspaceLayout
      navigation={
        <ExplorerFileTree
          tree={tree}
          scrollToIndexRef={scrollToIndexRef}
          viewportElementRef={viewportElementRef}
          roles={roles}
          activeEndpointIds={activeEndpointIds}
          hiddenCounts={hiddenCounts}
          datasetSelector={datasetSelector}
        />
      }
      canvas={
        <ExplorerRelationshipCanvas
          dataset={dataset}
          selectedEntry={selectedEntry}
          neighborhood={neighborhood}
          contextId={contextId}
          activeRelationshipId={relationship?.id ?? null}
          canGoBack={history.length > 0}
          onContextChange={changeContext}
          onPreview={previewConnection}
          onClearPreview={() => setPreview(null)}
          onBack={goBack}
        />
      }
      inspector={
        <ExplorerConnectionInspector
          dataset={dataset}
          relationship={relationship}
          endpointIds={endpointIds}
          candidateId={candidateId}
          incoming={[
            ...(neighborhood?.north ?? []),
            ...(neighborhood?.west ?? []),
          ].some((value) => value.relationshipId === relationship?.id)}
          onChooseCandidate={chooseCandidate}
          onReveal={revealEndpoint}
          onFocus={focusEndpoint}
        />
      }
    />
  );
}
