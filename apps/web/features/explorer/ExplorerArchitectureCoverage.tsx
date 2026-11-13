import { getPreviewEntry, type PreviewDataset } from './previewInventory';
import { ExplorerFileByteBar } from './ExplorerFileByteBar';
import byteStyles from './ExplorerArchitectureCoverage.module.css';
import styles from './layout/ExplorerOverviewLayout.module.css';

type ExplorerArchitectureCoverageProps = {
  /** Rust-generated coverage and the physical entries named by its rows. */
  readonly dataset: Pick<PreviewDataset, 'entries' | 'architectureCoverage'>;
  /** Recorded column to highlight; undefined when the context has no column. */
  readonly selectedArchitectureId: string | undefined;
  /** Stable colors shared by architecture columns and file byte regions. */
  readonly architectureColors: ReadonlyMap<string, string>;
};

type CoverageCellProps = {
  /** Number of recorded images returned by Rust for this file and CPU identity. */
  imageCount: number;
  /** Whether this cell belongs to the selected context's column. */
  selected: boolean;
};

/**
 * Present exact image coverage without selecting files or changing context.
 * @param props Generated coverage, entry records and the highlighted column.
 * @returns The coverage matrix, legend and recorded CPU details.
 */
export function ExplorerArchitectureCoverage({
  dataset,
  selectedArchitectureId,
  architectureColors,
}: ExplorerArchitectureCoverageProps) {
  const { architectures, binaries } = dataset.architectureCoverage;

  return (
    <section aria-labelledby="explorer-coverage-heading">
      <h3 id="explorer-coverage-heading">Architecture coverage</h3>
      <p>Recorded images across files in this application inventory.</p>
      {selectedArchitectureId === undefined && (
        <p className={styles.coverageNotice}>
          No images for the selected context’s CPU identity are recorded.
        </p>
      )}
      {binaries.length === 0 ? (
        <p className={styles.coverageNotice}>No images recorded.</p>
      ) : (
        <div
          className={styles.tableViewport}
          role="region"
          aria-label="Architecture coverage table"
          tabIndex={0}
        >
          <table
            className={styles.coverageTable}
            aria-describedby="explorer-coverage-legend"
          >
            <caption className={styles.visuallyHidden}>
              Recorded images by file and exact CPU identity
            </caption>
            <thead>
              <tr>
                <th scope="col">File / inventory path</th>
                {architectures.map((architecture) => (
                  <th
                    key={architecture.id}
                    scope="col"
                    data-selected={architecture.id === selectedArchitectureId}
                  >
                    <span
                      className={byteStyles.swatch}
                      aria-hidden="true"
                      style={{
                        backgroundColor: architectureColors.get(
                          architecture.id,
                        ),
                      }}
                    />{' '}
                    {architecture.label}
                    <small>
                      {architecture.id === selectedArchitectureId
                        ? 'Selected context'
                        : 'Recorded identity'}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {binaries.map((binary) => {
                const entry = getPreviewEntry(dataset.entries, binary.entryId);
                return (
                  <tr key={entry.id}>
                    <th scope="row">
                      <strong>{entry.name}</strong>
                      <code>{entry.path}</code>
                      {binary.byteLayout === null ? (
                        <small>File size and byte ranges not recorded</small>
                      ) : (
                        <div className={byteStyles.fileBytes}>
                          <ExplorerFileByteBar
                            byteLayout={binary.byteLayout}
                            fileName={entry.name}
                            dataset={dataset}
                            architectureColors={architectureColors}
                            selectedArchitectureId={selectedArchitectureId}
                          />
                        </div>
                      )}
                    </th>
                    {binary.matches.map((match) => (
                      <CoverageCell
                        key={match.architectureId}
                        imageCount={match.imageIds.length}
                        selected={
                          match.architectureId === selectedArchitectureId
                        }
                      />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div id="explorer-coverage-legend" className={styles.coverageLegend}>
        <span>
          <span aria-hidden="true" className={styles.legendDot}>
            ●
          </span>{' '}
          Recorded image · number when multiple
        </span>
        <span>
          <span aria-hidden="true">—</span> No image recorded for this CPU
          identity
        </span>
      </div>
      <p className={styles.coverageNote}>
        Only files with recorded images are shown. This describes recorded
        coverage, not thin/universal format or runtime compatibility. Bars show
        authored synthetic byte facts. Each full bar represents one whole file,
        independently of other file sizes. Full-color image regions match the
        selected CPU identity; striped regions are Other / unmapped bytes. Hover
        or keyboard-focus a region to inspect its exact byte range.
      </p>
      <details className={styles.cpuDetails}>
        <summary>All recorded CPU identities</summary>
        <dl className={styles.facts}>
          {architectures.map((architecture) => (
            <div key={architecture.id}>
              <dt>{architecture.label}</dt>
              <dd>
                {architecture.cpu.typeName ?? 'Unnamed CPU type'} /{' '}
                {architecture.cpu.subtypeName ?? 'Unnamed CPU subtype'}
                <small>
                  Type: 0x{architecture.cpu.typeRaw.toString(16)} · Subtype: 0x
                  {architecture.cpu.subtypeRaw.toString(16)}
                </small>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

/**
 * Keep the visible image marker and its accessible meaning together.
 * @param props Recorded image count and column highlighting.
 * @returns One table cell describing zero, one or multiple recorded images.
 */
function CoverageCell({ imageCount, selected }: CoverageCellProps) {
  const description =
    imageCount === 0
      ? 'No image recorded for this CPU identity'
      : `${imageCount} recorded ${imageCount === 1 ? 'image' : 'images'}`;

  return (
    <td data-selected={selected}>
      <span
        className={styles.coverageMarker}
        data-recorded={imageCount > 0}
        role="img"
        aria-label={description}
        title={description}
      >
        {imageCount === 0 ? '—' : imageCount === 1 ? '●' : imageCount}
      </span>
    </td>
  );
}
