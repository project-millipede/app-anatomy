'use client';

import { useMemo, useRef, useState } from 'react';
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
import type { PreviewNode } from './previewInventory';
import { nativeCanvasPresentation } from './nativeCanvasPresentation';
import styles from './NativeExplorerWorkspace.module.css';

/** The page owns the model; native selection changes reset only this file's presentation. */
export function NativeExplorerWorkspace({ model }: { model: WorkbenchModel }) {
  return (
    <SelectedFileWorkspace
      key={model.selectedFile?.resource ?? 'native-empty'}
      model={model}
    />
  );
}

/** Ark owns the acquired-file selection. References are evidence, never tree nodes. */
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
  const collection = useMemo(
    () =>
      createTreeCollection<PreviewNode>({
        nodeToValue: (node) => node.id,
        nodeToString: (node) => node.name,
        rootNode: {
          id: 'native-tree-root',
          name: '',
          children: selectedFile
            ? [
                {
                  id: selectedFile.resource,
                  name: selectedFile.name,
                  kind: 'file',
                },
              ]
            : [],
        },
      }),
    [selectedFile?.resource, selectedFile?.name],
  );
  const { tree, scrollToIndexRef } = useVirtualizedTree({
    collection,
    selectionMode: 'single',
    defaultSelectedValue: selectedFile ? [selectedFile.resource] : [],
    onSelectionChange: () => setPreview(null),
  });
  const { dataset, entry, neighborhood } = nativeCanvasPresentation(
    selectedFile,
    report,
    selectedSliceIndex,
  );
  const hasFeedback =
    model.operationPending ||
    model.hostError !== null ||
    model.outcome?.steps.some(({ result }) => result.tag === 'err');
  const feedback = hasFeedback ? (
    <div className={styles.feedback}>
      {model.operationPending && <p role="status">Waiting for response…</p>}
      <OutcomeErrors outcome={model.outcome} className={styles.error} />
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
            report
              ? 'Selected file only · Bundle inventory unavailable'
              : 'Select a file, then inspect its dependencies.'
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
          selectedEntry={
            tree.selectedValue.includes(entry?.id ?? '') ? entry : undefined
          }
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
