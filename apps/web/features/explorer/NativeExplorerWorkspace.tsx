'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createTreeCollection } from '@ark-ui/react/tree-view';
import type { Image } from '@apple-code/browser';
import type { WorkbenchModel } from '../workspace/types';
import { Button } from '../workspace/ark/Button';
import { DirectoryExpansionError } from '../workspace/DirectoryExpansionError';
import { ExplorerFileTree } from './ExplorerFileTree';
import { ExplorerRelationshipCanvas } from './ExplorerRelationshipCanvas';
import { NativeExplorerInspector } from './NativeExplorerInspector';
import { ExplorerWorkspaceLayout } from './layout/ExplorerWorkspaceLayout';
import {
  scrollVisibleTreeEntryIntoView,
  useVirtualizedTree,
} from './capabilities/tree-virtualization/useVirtualizedTree';
import {
  nativeExplorerSubject,
  nativeSelectedRowId,
  nativeTreePresentation,
  type NativeTreeNode,
} from './nativeTreePresentation';
import { nativeCanvasPresentation } from './nativeCanvasPresentation';
import {
  NativeTreeLoadError,
  type NativeTreeFailure,
} from './nativeTreeFailures';
import styles from './NativeExplorerWorkspace.module.css';

type NativeExplorerWorkspaceProps = {
  /** Native observations and presentation actions owned above the source tabs. */
  model: WorkbenchModel;
  /** Report independent failures without copying Rust or host diagnostics. */
  onTreeFailures: (failures: readonly NativeTreeFailure[]) => void;
};

/** Mount replacement resets navigation; file changes and inspection retain its tree. */
export function NativeExplorerWorkspace({
  model,
  onTreeFailures,
}: NativeExplorerWorkspaceProps) {
  const { application, file } = nativeExplorerSubject(model.nativeWorkspace);
  return (
    <SelectedFileWorkspace
      key={application?.resource ?? file?.resource ?? 'native-empty'}
      model={model}
      onTreeFailures={onTreeFailures}
    />
  );
}

/** Ark owns navigation; Rust's selected file alone determines the center and SEL row. */
function SelectedFileWorkspace({
  model,
  onTreeFailures,
}: NativeExplorerWorkspaceProps) {
  const { report, selectedSliceIndex, selectSlice } = model;
  const { application, file: selectedFile } = nativeExplorerSubject(
    model.nativeWorkspace,
  );
  const image =
    report?.resource === selectedFile?.resource
      ? report?.analysis.images[selectedSliceIndex]
      : undefined;
  const [preview, setPreview] = useState<{
    image: Image;
    index: number;
  } | null>(null);
  const activeIndex =
    preview?.image === image ? (preview?.index ?? null) : null;
  const viewportElementRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(false);
  const scopeResource = application?.resource ?? selectedFile?.resource ?? null;
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  // Inspection and file selection do not change the retained physical topology.
  const topology = JSON.stringify([
    application,
    application ? model.nativeWorkspace?.directories : undefined,
    application ? undefined : selectedFile,
  ]);
  const collection = useMemo(() => {
    const { rootNode } = nativeTreePresentation(model.nativeWorkspace);
    return createTreeCollection<NativeTreeNode>({
      nodeToValue: (node) => node.id,
      nodeToString: (node) => node.name,
      nodeToChildrenCount: (node) => node.childrenCount,
      isNodeDisabled: (node) =>
        node.kind === 'symlink' || node.kind === 'other',
      rootNode,
    });
    // Rust snapshots are immutable observations; only topology changes rebuild it.
  }, [topology]);
  const selectedId = nativeSelectedRowId(model.nativeWorkspace);
  const { tree, scrollToIndexRef } = useVirtualizedTree({
    collection,
    selectionMode: 'single',
    expandOnClick: false,
    selectedValue: selectedId ? [selectedId] : [],
    defaultExpandedValue: [
      ...new Set([
        ...(collection.rootNode.children
          ?.filter((node) => node.kind === 'directory')
          .map((node) => node.id) ?? []),
        ...(selectedId
          ? collection.getParentNodes(selectedId).map((node) => node.id)
          : []),
      ]),
    ],
    onSelectionChange: ({ selectedNodes }) => {
      const [node] = selectedNodes;
      if (node?.kind !== 'file') return;
      setPreview(null);
      if (node.id === selectedId) return;
      if (node.parentDirectory !== undefined && node.entryId !== undefined)
        void model.openNativeEntry(node.entryId, node.parentDirectory);
    },
    loadChildren: async ({ node, signal }) => {
      // Completion supplies the admitted identity even if this callback's model is older.
      let operation = model.feedback.operation;
      try {
        if (node.childrenLoaded) return node.children ?? [];
        if (node.parentDirectory === undefined || node.entryId === undefined)
          throw new Error(
            'No loaded directory snapshot is available. Choose the folder again.',
          );
        const expansion = await model.expandNativeDirectory(
          node.parentDirectory,
          node.entryId,
        );
        operation = expansion.operation;
        if (
          signal.aborted ||
          expansion.selection.root?.resource !==
            model.nativeWorkspace?.root?.resource
        )
          throw new Error('This folder is no longer being displayed.');
        const loadedNode = createTreeCollection<NativeTreeNode>({
          nodeToValue: (node) => node.id,
          nodeToString: (node) => node.name,
          rootNode: nativeTreePresentation(expansion.selection).rootNode,
        }).findNode(node.id);
        if (!loadedNode?.childrenLoaded)
          throw new Error(
            'No loaded directory snapshot was returned. Try again.',
          );
        return loadedNode.children ?? [];
      } catch (caught) {
        const failure =
          caught instanceof DirectoryExpansionError
            ? caught
            : new DirectoryExpansionError(
                caught instanceof Error
                  ? caught.message
                  : 'Folder loading failed without an error message.',
                operation,
                'tree',
              );
        throw new NativeTreeLoadError(failure, signal);
      }
    },
    onLoadChildrenError: ({ nodes }) => {
      if (!isMountedRef.current) return;
      const failures: NativeTreeFailure[] = [];
      for (const { node, error } of nodes) {
        const loadError = error instanceof NativeTreeLoadError ? error : null;
        if (
          loadError &&
          (loadError.signal.aborted ||
            loadError.failure.reportingOwner === 'operation')
        )
          continue;
        failures.push({
          operation: loadError
            ? loadError.failure.operation
            : model.feedback.operation,
          scopeResource,
          nodeId: node.id,
          nodeName: node.name,
          error: loadError?.failure ?? error,
        });
      }
      if (failures.length > 0) onTreeFailures(failures);
    },
  });
  // Reveal the retained selection once, after initial ancestor expansion commits.
  // Later inspection, selection and manual scrolling do not repeat this reveal.
  useLayoutEffect(() => {
    if (!selectedId) return;
    const frame = requestAnimationFrame(() => {
      scrollVisibleTreeEntryIntoView({
        tree,
        scrollToIndexRef,
        viewportElementRef,
        entryId: selectedId,
      });
    });
    return () => cancelAnimationFrame(frame);
    // This owner is keyed by mount identity; only its initial selection is revealed.
  }, []);
  const { dataset, entry, neighborhood } = nativeCanvasPresentation(
    selectedFile,
    report,
    selectedSliceIndex,
    application,
  );
  return (
    <ExplorerWorkspaceLayout
      navigation={
        <ExplorerFileTree
          tree={tree}
          scrollToIndexRef={scrollToIndexRef}
          viewportElementRef={viewportElementRef}
          roles={new Map()}
          activeEndpointIds={new Set()}
          hiddenCounts={new Map()}
          datasetSelector={null}
          description={null}
          summary={
            application
              ? `${application.name} · Application scope · Select an internal file to inspect`
              : selectedFile
                ? 'Standalone binary · No application scope'
                : model.nativeWorkspace &&
                    model.nativeWorkspace.scope !== 'empty'
                  ? 'This selection is not an Explorer application or binary. Open an application or binary to continue.'
                  : 'Open an application or standalone binary.'
          }
        />
      }
      canvas={
        <ExplorerRelationshipCanvas
          mode="declarations"
          applicationName={application?.name}
          actions={
            <Button
              className={styles.inspectButton}
              disabled={model.operationPending || !selectedFile}
              onClick={model.inspectNativeDependencies}
            >
              Inspect dependencies
            </Button>
          }
          declarationsInspected={Boolean(image?.dependencies)}
          dataset={dataset}
          selectedEntry={entry}
          neighborhood={neighborhood}
          contextId={String(image ? selectedSliceIndex : 0)}
          activeRelationshipId={
            activeIndex === null ? null : `declaration-${activeIndex}`
          }
          canGoBack={activeIndex !== null}
          onContextChange={(id) => {
            setPreview(null);
            selectSlice(Number(id));
          }}
          onPreview={(connection) => {
            const index = dataset.relationships.findIndex(
              (value) => value.id === connection.relationshipId,
            );
            if (image && index >= 0) setPreview({ image, index });
          }}
          onClearPreview={() => setPreview(null)}
          onBack={() => setPreview(null)}
        />
      }
      inspector={
        <NativeExplorerInspector
          key={`${selectedSliceIndex}:${activeIndex ?? 'source'}`}
          image={image}
          selection={
            activeIndex === null
              ? { kind: 'source' }
              : { kind: 'library', index: activeIndex }
          }
        />
      }
    />
  );
}
