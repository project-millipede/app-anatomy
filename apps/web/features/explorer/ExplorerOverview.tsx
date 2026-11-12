import type { ReactNode } from 'react';
import type { PreviewDataset } from './previewInventory';
import styles from './ExplorerLayout.module.css';
import workspaceStyles from './ExplorerWorkspace.module.css';

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
 * Present recorded scope and context facts before relationship exploration.
 * @param props Generated dataset, selected context and selection controls.
 * @returns An overview without native inspection or binary interpretation.
 */
export function ExplorerOverview({
  dataset,
  datasetSelector,
  contextId,
  onContextChange,
}: ExplorerOverviewProps) {
  const context = dataset.contexts.find((value) => value.id === contextId);
  if (!context) throw new Error(`Explorer context is missing: ${contextId}`);

  /**
   * Look up the physical path recorded for an image identifier.
   * @param imageId Image named by the generated context.
   * @returns The recorded entry path, without following aliases or references.
   */
  function imagePath(imageId: string): string {
    const image = dataset.images.find((value) => value.id === imageId);
    const entry = image
      ? dataset.entries.find((value) => value.id === image.entryId)
      : undefined;
    if (!entry) {
      throw new Error(
        `Explorer context image has no recorded entry: ${imageId}`,
      );
    }
    return entry.path;
  }

  return (
    <main className={workspaceStyles.overview}>
      <header>
        <span className={styles.placeholderEyebrow}>Synthetic application</span>
        <h2>{dataset.label}</h2>
        <p>{dataset.description}</p>
      </header>
      <div className={workspaceStyles.controls}>
        {datasetSelector}
        <label className={styles.selectLabel}>
          Architecture context
          <select
            value={contextId}
            onChange={(event) => onContextChange(event.target.value)}
          >
            {dataset.contexts.map((value) => (
              <option key={value.id} value={value.id}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={workspaceStyles.guidance}>
        Open Relationships to select a file and explore this context. Choosing a
        different context starts with a fresh tree and no selected file.
      </p>
      <section aria-labelledby="explorer-context-facts">
        <h3 id="explorer-context-facts">Selected context</h3>
        <dl className={workspaceStyles.facts}>
          <div>
            <dt>Application scope</dt>
            <dd>
              <code>{dataset.rootPath}</code>
            </dd>
          </div>
          <div>
            <dt>CPU type</dt>
            <dd>
              {context.cpu.typeName ?? 'Unnamed CPU type'}
              <small>
                Recorded value: 0x{context.cpu.typeRaw.toString(16)}
              </small>
            </dd>
          </div>
          <div>
            <dt>CPU subtype</dt>
            <dd>
              {context.cpu.subtypeName ?? 'Unnamed CPU subtype'}
              <small>
                Recorded value: 0x{context.cpu.subtypeRaw.toString(16)}
              </small>
            </dd>
          </div>
          <div>
            <dt>Executable</dt>
            <dd>
              {context.executableImageId ? (
                <code>{imagePath(context.executableImageId)}</code>
              ) : (
                'Not specified'
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="explorer-context-runpaths">
        <h3 id="explorer-context-runpaths">Ordered runpaths</h3>
        {context.runpaths.length === 0 ? (
          <p>No runpaths supplied in this context.</p>
        ) : (
          <ol className={workspaceStyles.runpaths}>
            {context.runpaths.map((runpath, index) => (
              <li key={`${index}:${runpath.ownerImageId}:${runpath.path}`}>
                <code>{runpath.path}</code>
                <span>
                  Declared by <code>{imagePath(runpath.ownerImageId)}</code>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
