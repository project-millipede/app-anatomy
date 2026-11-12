'use client';

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TabsRootProvider, useTabs } from '@ark-ui/react/tabs';
import { Tabs } from '../workspace/ark/Tabs';
import {
  scrollVisibleTreeEntryIntoView,
  useVirtualizedTree,
} from './capabilities/tree-virtualization/useVirtualizedTree';
import { ExplorerConnectionInspector } from './ExplorerConnectionInspector';
import { ExplorerFileTree } from './ExplorerFileTree';
import { ExplorerRelationshipCanvas } from './ExplorerRelationshipCanvas';
import { ExplorerWorkspaceLayout } from './layout/ExplorerWorkspaceLayout';
import { ExplorerOverview } from './ExplorerOverview';
import {
  createPreviewInventory,
  previewDatasets,
  type PreviewConnection,
  type PreviewDataset,
} from './previewInventory';
import { collapsedRelatedCounts } from './treePresentation';
import styles from './ExplorerLayout.module.css';
import workspaceStyles from './ExplorerWorkspace.module.css';

enum ExplorerView {
  Overview = 'overview',
  Relationships = 'relationships',
}

type Preview = { relationshipId: string; candidateId: string | null };
type HistoryEntry = {
  entryId: string;
  preview: Preview | null;
  expandedIds: string[];
  scrollTop: number;
};

/** Dataset changes reset only this synthetic presentation, which has no native owner. */
export function ExplorerWorkspace() {
  const [datasetId, setDatasetId] = useState(() => {
    const [initialDataset] = previewDatasets;
    if (!initialDataset) throw new Error('Explorer preview has no datasets.');
    return initialDataset.id;
  });
  const dataset = previewDatasets.find((value) => value.id === datasetId);
  if (!dataset) throw new Error(`Explorer dataset is missing: ${datasetId}`);
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

/**
 * Select the exploration context independently of the relationship session.
 * @param props Generated dataset and its selection control.
 * @returns Overview and a retained, context-keyed relationship workspace.
 */
function DatasetWorkspace({
  dataset,
  datasetSelector,
}: {
  dataset: PreviewDataset;
  datasetSelector: ReactNode;
}) {
  const [contextId, setContextId] = useState(dataset.initialContextId);
  const tabs = useTabs({
    defaultValue: ExplorerView.Overview,
    /*
     * 1. Arrow keys move between view tabs without hiding the current view.
     * 2. Enter, Space or a click activates the chosen view.
     */
    activationMode: 'manual',
  });

  return (
    <TabsRootProvider
      id="workbench"
      tabIndex={-1}
      value={tabs}
      className={workspaceStyles.workspace}
      /*
       * 1. Mount each view when it is first activated.
       * 2. Retain inactive content so a visit to Overview preserves exploration.
       * 3. A different context key replaces the entire relationship session.
       */
      lazyMount
    >
      <Tabs.List
        layout="workspace"
        className={workspaceStyles.views}
        aria-label="Synthetic Explorer views"
      >
        <Tabs.Trigger layout="workspace" value={ExplorerView.Overview}>
          Overview
        </Tabs.Trigger>
        <Tabs.Trigger layout="workspace" value={ExplorerView.Relationships}>
          Relationships
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content
        layout="workspace"
        value={ExplorerView.Overview}
        className={workspaceStyles.panel}
      >
        <ExplorerOverview
          dataset={dataset}
          datasetSelector={datasetSelector}
          contextId={contextId}
          onContextChange={setContextId}
        />
      </Tabs.Content>
      <Tabs.Content
        layout="workspace"
        value={ExplorerView.Relationships}
        className={workspaceStyles.panel}
      >
        <RelationshipSession
          key={contextId}
          dataset={dataset}
          contextId={contextId}
        />
      </Tabs.Content>
    </TabsRootProvider>
  );
}

/**
 * Own exploration state for one fixed context until its session is replaced.
 * @param props Generated dataset and the context fixed for this session.
 * @returns The physical tree, selected neighborhood and relationship inspector.
 */
function RelationshipSession({
  dataset,
  contextId,
}: {
  dataset: PreviewDataset;
  contextId: string;
}) {
  const collection = useMemo(() => createPreviewInventory(dataset), [dataset]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const viewportElementRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<
    { entryId: string } | { scrollTop: number } | null
  >(null);
  const suppressSelectionHistory = useRef(false);
  const { tree, scrollToIndexRef } = useVirtualizedTree({
    collection,
    selectionMode: 'single',
    expandOnClick: false,
    onSelectionChange: recordTreeNavigation,
    defaultSelectedValue: [],
    defaultExpandedValue: dataset.entries
      .filter((entry) => entry.parentId === null)
      .map((entry) => entry.id),
  });
  const [entryId] = tree.selectedValue;
  const selectedEntry = dataset.entries.find((entry) => entry.id === entryId);
  const neighborhood = entryId ? getNeighborhood(entryId) : undefined;
  if (entryId && !selectedEntry) {
    throw new Error(`Explorer preview entry is missing: ${entryId}`);
  }
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
  const endpointIds = activeConnection ? activeConnection.endpointIds : [];
  const candidateId =
    preview?.candidateId && endpointIds.includes(preview.candidateId)
      ? preview.candidateId
      : null;
  const activeEndpointIds = new Set(candidateId ? [candidateId] : endpointIds);
  const roles = new Map(
    neighborhood ? neighborhood.roles.map((role) => [role.entryId, role]) : [],
  );
  const hiddenCounts = collapsedRelatedCounts(
    roles.keys(),
    tree.expandedValue,
    (id) => collection.getParentNodes(id).map((node) => node.id),
  );

  /**
   * Require the generated projection for a selection in this fixed context.
   * @param selectedEntryId Physical entry selected by Ark.
   * @returns Its Rust-computed neighborhood, including legitimate empty results.
   */
  function getNeighborhood(selectedEntryId: string) {
    const projection = dataset.neighborhoods.find(
      (value) =>
        value.entryId === selectedEntryId && value.contextId === contextId,
    );
    if (!projection) {
      throw new Error(
        `Explorer neighborhood is missing for ${selectedEntryId} in ${contextId}.`,
      );
    }
    return projection;
  }

  /**
   * Record the previous center before presenting Ark's new selection.
   * @param details Ark's updated single-selection values.
   * @returns Nothing; updates navigation, preview and related ancestor expansion.
   */
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
    if (nextEntryId === entryId) return;
    if (entryId) {
      setHistory((current) => [
        ...current,
        {
          entryId,
          preview,
          expandedIds: [...tree.expandedValue],
          scrollTop: viewportElementRef.current?.scrollTop ?? 0,
        },
      ]);
    }
    setPreview(null);
    if (!nextEntryId) return;
    expandEndpoints(
      getNeighborhood(nextEntryId).roles.map((role) => role.entryId),
    );
  }

  /**
   * Reveal endpoint ancestors without changing selection or keyboard focus.
   * @param ids Direct endpoint identities from the generated projection.
   * @returns Nothing; expands their physical ancestor branches in Ark.
   */
  function expandEndpoints(ids: readonly string[]) {
    const ancestors = new Set(
      ids.flatMap((id) => collection.getParentNodes(id).map((node) => node.id)),
    );
    if (ancestors.size > 0) tree.expand([...ancestors]);
  }

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
    const [firstEndpoint] = connection.endpointIds;
    const onlyEndpoint =
      connection.endpointIds.length === 1 && firstEndpoint !== undefined
        ? firstEndpoint
        : null;
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
    // the previous exploration and then clears it for the new center.
    tree.setSelectedValue([candidateId]);
  }

  function goBack() {
    const previous = history.at(-1);
    if (!previous) return;
    suppressSelectionHistory.current = previous.entryId !== entryId;
    pendingScroll.current = { scrollTop: previous.scrollTop };
    setHistory((current) => current.slice(0, -1));
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
          datasetSelector={null}
          summary={
            selectedEntry
              ? `${roles.size} related resources · No files inspected`
              : 'Select a file to explore its relationships.'
          }
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
          onPreview={previewConnection}
          onClearPreview={() => setPreview(null)}
          onBack={goBack}
        />
      }
      inspector={
        selectedEntry && (
          <ExplorerConnectionInspector
            dataset={dataset}
            relationship={relationship}
            endpointIds={endpointIds}
            candidateId={candidateId}
            incoming={Boolean(
              neighborhood &&
              [...neighborhood.north, ...neighborhood.west].some(
                (value) => value.relationshipId === relationship?.id,
              ),
            )}
            onChooseCandidate={chooseCandidate}
            onReveal={revealEndpoint}
            onFocus={focusEndpoint}
          />
        )
      }
    />
  );
}
