import { Tabs } from './Tabs';
import { ImageDetails } from '../ImageDetails';
import { cpuLabel, containerLabels, scopeLabels } from '../reportPresentation';
import styles from './Workbench.module.css';
import type { ReportPresentation } from '../types';

/**
 * Render one report with architecture selection controlled by the workbench.
 * @param props Report, selected slice and the tab-change callback.
 * @returns Binary details or guidance when no report is available.
 */
export function ReportViewer({
  report,
  selectedSliceIndex,
  selectSlice,
}: ReportPresentation) {
  const image = report?.analysis.images[selectedSliceIndex];
  return (
    <section className={styles.detail} aria-label="Binary details">
      {!report ? (
        <div className={styles.empty}>
          <span className={styles.fileGlyph} aria-hidden="true">
            M–O
          </span>
          <h2>A closer look at your binaries</h2>
          <p>
            Select a native file or browse a native folder, then choose Analyze
            native file.
          </p>
          <p className={styles.note}>
            Signature metadata does not establish signature validity or
            execution eligibility.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.detailHeading}>
            <span className={styles.sectionLabel}>CURRENT ANALYSIS</span>
            <h2>{report.name}</h2>
            <p>
              {containerLabels[report.analysis.container]}{' '}
              <span aria-hidden="true">/</span>{' '}
              {report.analysis.byteLength.toLocaleString()} bytes{' '}
              <span aria-hidden="true">/</span> {report.analysis.images.length}{' '}
              architecture slices
            </p>
          </div>
          <Tabs.Root
            key={report.resource}
            activationMode="manual"
            lazyMount
            unmountOnExit
            value={String(selectedSliceIndex)}
            onValueChange={({ value }) => selectSlice(Number(value))}
          >
            <Tabs.List aria-label="Architecture slices">
              {report.analysis.images.map((item, index) => (
                <Tabs.Trigger key={index} value={String(index)}>
                  {cpuLabel(item.cpu)}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {report.analysis.images.map((item, index) => (
              <Tabs.Content key={index} value={String(index)}>
                <ImageDetails
                  image={item}
                  styles={{
                    facts: styles.facts,
                    note: styles.note,
                    evidence: styles.evidence,
                  }}
                />
              </Tabs.Content>
            ))}
          </Tabs.Root>
          {image && (
            <div className={styles.disclaimer}>
              <p>{scopeLabels[report.analysis.scope]}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
