'use client';

import { ErrorMessage } from '../ErrorMessage';
import { OutcomeErrors } from '../OutcomeErrors';
import { NativeControls } from './NativeControls';
import { DirectoryListing } from './DirectoryListing';
import { ReportViewer } from './ReportViewer';
import styles from './Workbench.module.css';
import type { WorkbenchProps } from '../types';

/**
 * Present the supplied workbench model with controls, a listing and a report.
 * @param props Shared model and layout options for this presentation.
 * @returns The workbench presentation without component-runtime ownership.
 */
export function Workbench({ model, embedded = false }: WorkbenchProps) {
  const {
    operationPending,
    outcome,
    hostError,
    selectedFile,
    nativeDirectory,
    chooseNativeFile,
    chooseNativeDirectory,
    openNativeEntry,
    inspectNative,
    inspectNativeDependencies,
    report,
    selectedSliceIndex,
    selectSlice,
  } = model;
  const Container = embedded ? 'div' : 'main';
  return (
    <div className={`${styles.page} ${embedded ? styles.embedded : ''}`}>
      {!embedded && (
        <header className={styles.header}>
          <div>
            <span className={styles.wordmark}>CODE WORKBENCH</span>
            <span className={styles.caption}>Apple binaries</span>
          </div>
        </header>
      )}
      <Container
        id={embedded ? undefined : 'workbench'}
        className={styles.main}
      >
        {!embedded && (
          <div className={styles.introduction}>
            <h1>Binary workspace</h1>
            <p>
              Select a native Mach-O file to explore its architecture, platform
              and declared dependencies.
            </p>
          </div>
        )}
        <NativeControls
          operationPending={operationPending}
          selectedFile={selectedFile}
          chooseNativeFile={chooseNativeFile}
          chooseNativeDirectory={chooseNativeDirectory}
          inspectNative={inspectNative}
          inspectNativeDependencies={inspectNativeDependencies}
        />
        <OutcomeErrors outcome={outcome} className={styles.error} />
        {hostError !== null && (
          <ErrorMessage
            message={hostError}
            aria-label="Host execution error"
            className={styles.error}
          />
        )}
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            {nativeDirectory && (
              <DirectoryListing
                directory={nativeDirectory}
                operationPending={operationPending}
                openNativeEntry={openNativeEntry}
              />
            )}
            <div className={styles.scope}>
              <strong>Analysis scope</strong>
              <p>
                Native selection supplies bounded reads for Rust header and
                dependency inspection. Application-wide target resolution and
                signing are not available.
              </p>
            </div>
          </aside>
          <ReportViewer
            report={report}
            selectedSliceIndex={selectedSliceIndex}
            selectSlice={selectSlice}
          />
        </div>
        {!embedded && (
          <footer className={styles.footer}>
            <span>Read-only analysis</span>
            <span>Rust core → WebAssembly component → React</span>
          </footer>
        )}
      </Container>
    </div>
  );
}
