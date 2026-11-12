import {
  getPreviewEntry,
  type PreviewContext,
  type PreviewDataset,
} from './previewInventory';
import styles from './ExplorerLayout.module.css';
import overviewStyles from './layout/ExplorerOverviewLayout.module.css';

type ExplorerContextPanelProps = {
  /** Recorded entries, images and authored contexts used by this panel. */
  dataset: Pick<PreviewDataset, 'entries' | 'images' | 'contexts'>;
  /** Selected context resolved by the containing Overview. */
  context: PreviewContext;
  /** Display label supplied by the selected recorded architecture or context. */
  architectureLabel: string;
  /** Forward an explicit context change to the existing workspace owner. */
  onContextChange: (contextId: string) => void;
};

/**
 * Present the context used by relationship exploration and its recorded inputs.
 * @param props Authored records, selected context and its change callback.
 * @returns Context controls, executable facts, CPU details and ordered runpaths.
 */
export function ExplorerContextPanel({
  dataset,
  context,
  architectureLabel,
  onContextChange,
}: ExplorerContextPanelProps) {
  /**
   * Look up the physical path recorded for an image identifier.
   * @param imageId Image named by the generated context.
   * @returns The recorded entry path, without following aliases or references.
   */
  function getImagePath(imageId: string): string {
    const image = dataset.images.find((value) => value.id === imageId);
    if (!image)
      throw new Error(`Explorer context image is missing: ${imageId}`);
    return getPreviewEntry(dataset.entries, image.entryId).path;
  }

  return (
    <section
      className={overviewStyles.contextPanel}
      aria-labelledby="explorer-context-facts"
    >
      <h3 id="explorer-context-facts">Exploration context</h3>
      <label className={styles.selectLabel}>
        Architecture context
        <select
          value={context.id}
          onChange={(event) => onContextChange(event.target.value)}
        >
          {dataset.contexts.map((value) => (
            <option key={value.id} value={value.id}>
              {value.label}
            </option>
          ))}
        </select>
      </label>
      <p className={overviewStyles.guidance}>
        Open Relationships to select a file. Changing context starts a fresh
        session with no selected file.
      </p>
      <dl className={overviewStyles.facts}>
        <div>
          <dt>Architecture</dt>
          <dd>{architectureLabel}</dd>
        </div>
        <div>
          <dt>Executable</dt>
          <dd>
            {context.executableImageId ? (
              <code>{getImagePath(context.executableImageId)}</code>
            ) : (
              'Not specified'
            )}
          </dd>
        </div>
      </dl>
      <details className={overviewStyles.cpuDetails}>
        <summary>Recorded CPU values</summary>
        <dl className={overviewStyles.facts}>
          <div>
            <dt>CPU type</dt>
            <dd>
              {context.cpu.typeName ?? 'Unnamed CPU type'}
              <small>0x{context.cpu.typeRaw.toString(16)}</small>
            </dd>
          </div>
          <div>
            <dt>CPU subtype</dt>
            <dd>
              {context.cpu.subtypeName ?? 'Unnamed CPU subtype'}
              <small>0x{context.cpu.subtypeRaw.toString(16)}</small>
            </dd>
          </div>
        </dl>
      </details>
      <section aria-labelledby="explorer-context-runpaths">
        <h3 id="explorer-context-runpaths">Ordered runpaths</h3>
        {context.runpaths.length === 0 ? (
          <p>No runpaths supplied in this context.</p>
        ) : (
          <ol className={overviewStyles.runpaths}>
            {context.runpaths.map((runpath, index) => (
              <li key={`${index}:${runpath.ownerImageId}:${runpath.path}`}>
                <code>{runpath.path}</code>
                <span>
                  Declared by <code>{getImagePath(runpath.ownerImageId)}</code>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
