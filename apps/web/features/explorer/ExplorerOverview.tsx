import type { ReactNode } from 'react';
import { ExplorerArchitectureCoverage } from './ExplorerArchitectureCoverage';
import { ExplorerContextPanel } from './ExplorerContextPanel';
import { ExplorerOverviewLayout } from './layout/ExplorerOverviewLayout';
import { getPreviewContext, type PreviewDataset } from './previewInventory';
import styles from './ExplorerLayout.module.css';
import overviewStyles from './layout/ExplorerOverviewLayout.module.css';

type ExplorerOverviewProps = {
  /** Authored inventory and the contexts supplied by Rust. */
  dataset: PreviewDataset;
  /** Dataset selection stays outside the relationship session. */
  datasetSelector: ReactNode;
  /** Context used when entering the relationship workspace. */
  contextId: string;
  /** Replacing the context starts a fresh exploration session. */
  onContextChange: (contextId: string) => void;
};

/**
 * Compose application facts and the selected exploration context.
 * @param props Generated dataset, selected context and selection controls.
 * @returns The Overview's named layout regions without owning navigation state.
 */
export function ExplorerOverview({
  dataset,
  datasetSelector,
  contextId,
  onContextChange,
}: ExplorerOverviewProps) {
  const context = getPreviewContext(dataset, contextId);
  const { architectures, binaries } = dataset.architectureCoverage;
  const selectedArchitecture = architectures.find(
    (architecture) => architecture.id === context.architectureId,
  );

  return (
    <ExplorerOverviewLayout
      header={
        <>
          <div>
            <span className={styles.placeholderEyebrow}>
              Synthetic application
            </span>
            <h2>{dataset.label}</h2>
            <p>{dataset.description}</p>
            <code className={overviewStyles.scopePath}>{dataset.rootPath}</code>
          </div>
          {datasetSelector}
        </>
      }
      summary={
        <>
          <div>
            <dt>Files with recorded images</dt>
            <dd>{binaries.length}</dd>
          </div>
          <div>
            <dt>Recorded images</dt>
            <dd>{dataset.images.length}</dd>
          </div>
          <div>
            <dt>Recorded CPU identities</dt>
            <dd>{architectures.length}</dd>
          </div>
        </>
      }
      context={
        <ExplorerContextPanel
          dataset={dataset}
          context={context}
          architectureLabel={
            selectedArchitecture?.label ?? context.architecture
          }
          onContextChange={onContextChange}
        />
      }
      coverage={
        <ExplorerArchitectureCoverage
          dataset={dataset}
          selectedArchitectureId={selectedArchitecture?.id}
        />
      }
    />
  );
}
