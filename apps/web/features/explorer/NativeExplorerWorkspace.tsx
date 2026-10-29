'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createTreeCollection } from '@ark-ui/react/tree-view';
import type { Image } from '@apple-code/browser';
import type { WorkbenchModel } from '../workspace/types';
import { Button } from '../workspace/ark/Button';
import { ErrorMessage } from '../workspace/ErrorMessage';
import { OutcomeErrors } from '../workspace/OutcomeErrors';
import { ExplorerFileTree } from './ExplorerFileTree';
import { ExplorerRelationshipCanvas } from './ExplorerRelationshipCanvas';
import { NativeExplorerInspector } from './NativeExplorerInspector';
import { ExplorerWorkspaceLayout } from './layout/ExplorerWorkspaceLayout';
import { useVirtualizedTree } from './capabilities/tree-virtualization/useVirtualizedTree';
import {
  nativeSelectedRowId,
  nativeTreePresentation,
  type NativeTreeNode,
} from './nativeTreePresentation';
import { nativeCanvasPresentation } from './nativeCanvasPresentation';
import styles from './NativeExplorerWorkspace.module.css';

/** Mount replacement resets navigation; file changes and inspection retain its tree. */
export function NativeExplorerWorkspace({ model }: { model: WorkbenchModel }) {
  return (
    <SelectedFileWorkspace
      key={
        model.nativeWorkspace?.root?.resource ??
        model.selectedFile?.resource ??
        'native-empty'
      }
      model={model}
    />
  );
}

/** Ark owns navigation; Rust's selected file alone determines the center and SEL row. */
function SelectedFileWorkspace({ model }: { model: WorkbenchModel }) {
  const { selectedFile, report, selectedSliceIndex, selectSlice } = model;
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
  const [treeError, setTreeError] = useState<string | null>(null);
  // Inspection and file selection do not change the retained physical topology.
  const topology = JSON.stringify([
    model.nativeWorkspace?.root,
    model.nativeWorkspace?.directories,
    model.nativeWorkspace?.fileEntry ? undefined : selectedFile,
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
      const node = selectedNodes[0];
      if (node?.kind !== 'file') return;
      setPreview(null);
      setTreeError(null);
      if (node.id === selectedId) return;
      if (node.parentDirectory !== undefined && node.entryId !== undefined)
        void model.openNativeEntry(node.entryId, node.parentDirectory);
    },
    loadChildren: async ({ node, signal }) => {
      setTreeError(null);
      if (node.childrenLoaded) return node.children ?? [];
      if (node.parentDirectory === undefined || node.entryId === undefined)
        throw new Error(
          'No loaded directory snapshot is available. Choose the folder again.',
        );
      const state = await model.expandNativeDirectory(
        node.parentDirectory,
        node.entryId,
      );
      if (
        signal.aborted ||
        state.root?.resource !== model.nativeWorkspace?.root?.resource
      )
        throw new Error('This folder is no longer being displayed.');
      const observed = createTreeCollection<NativeTreeNode>({
        nodeToValue: (node) => node.id,
        nodeToString: (node) => node.name,
        rootNode: nativeTreePresentation(state).rootNode,
      }).findNode(node.id);
      if (!observed?.childrenLoaded)
        throw new Error(
          'No loaded directory snapshot was returned. Try again.',
        );
      return observed.children ?? [];
    },
    onLoadChildrenError: ({ nodes }) => {
      const message = nodes[0]?.error.message;
      if (message) setTreeError(message);
    },
  });
  // Reveal the retained selection once, after initial ancestor expansion commits.
  // Later inspection, selection and manual scrolling do not repeat this reveal.
  useLayoutEffect(() => {
    if (!selectedId) return;
    const frame = requestAnimationFrame(() => {
      const nodes = tree.getVisibleNodes();
      const index = nodes.findIndex(({ node }) => node.id === selectedId);
      const row = nodes[index];
      if (row)
        scrollToIndexRef.current?.({
          index,
          node: row.node,
          indexPath: row.indexPath,
          getElement: () =>
            viewportElementRef.current?.querySelector<HTMLElement>(
              `[data-value="${CSS.escape(selectedId)}"]`,
            ) ?? null,
        });
    });
    return () => cancelAnimationFrame(frame);
    // This owner is keyed by mount identity; only its initial selection is revealed.
  }, []);
  const { dataset, entry, neighborhood } = nativeCanvasPresentation(
    selectedFile,
    report,
    selectedSliceIndex,
  );
  const displayedTreeError =
    treeError !== null &&
    treeError !== model.hostError &&
    !model.outcome?.steps.some(
      ({ result }) => result.tag === 'err' && result.val.message === treeError,
    )
      ? treeError
      : null;
  const hasFeedback =
    displayedTreeError !== null ||
    model.operationPending ||
    model.hostError !== null ||
    model.outcome?.steps.some(({ result }) => result.tag === 'err');
  const feedback = hasFeedback ? (
    <div className={styles.feedback}>
      {model.operationPending && <p role="status">Waiting for response…</p>}
      <OutcomeErrors outcome={model.outcome} className={styles.error} />
      {displayedTreeError !== null && (
        <ErrorMessage
          message={displayedTreeError}
          className={styles.error}
          aria-label="Folder expansion error"
        />
      )}
      {model.hostError !== null && (
        <ErrorMessage
          message={model.hostError}
          className={styles.error}
          aria-label="Host execution error"
        />
      )}
    </div>
  ) : null;
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
            model.nativeWorkspace?.directory && !model.nativeWorkspace.root
              ? 'Update Native Workbench to mount this folder in Files. Single-file inspection remains available.'
              : model.nativeWorkspace?.root
                ? 'Mounted native folder · Only loaded directories are shown'
                : selectedFile
                  ? 'Selected native file · No folder mounted'
                  : 'Select a file or browse a native folder.'
          }
        />
      }
      canvas={
        <ExplorerRelationshipCanvas
          mode="declarations"
          actions={
            <Button
              className={styles.inspectButton}
              disabled={model.operationPending || !selectedFile}
              onClick={model.inspectNativeDependencies}
            >
              Inspect dependencies
            </Button>
          }
          feedback={feedback}
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
