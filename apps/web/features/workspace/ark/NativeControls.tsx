import { Button } from './Button';
import styles from './Workbench.module.css';
import type { NativeControlsProps } from '../types';

/**
 * Present native selection and analysis actions without owning their lifecycle.
 * @param props Observed file, pending state and workbench-owned actions.
 * @returns Native-access controls and a pending indicator for the invocation.
 */
export function NativeControls({
  operationPending,
  selectedFile,
  chooseNativeFile,
  chooseNativeDirectory,
  inspectNative,
}: NativeControlsProps) {
  return (
    <section className={styles.nativeAccess} aria-label="Native file access">
      <div>
        <strong>{selectedFile?.name ?? 'Native file access'}</strong>
        <p role="status">{operationPending ? 'Waiting for response…' : ''}</p>
        <p>File and folder selection requires the native service.</p>
      </div>
      <div className={styles.actions}>
        <Button
          variant="secondary"
          disabled={operationPending}
          onClick={chooseNativeFile}
        >
          Select native file
        </Button>
        <Button
          variant="secondary"
          disabled={operationPending}
          onClick={chooseNativeDirectory}
        >
          Select native folder
        </Button>
        <Button
          variant="secondary"
          disabled={operationPending || !selectedFile}
          onClick={inspectNative}
        >
          Analyze native file
        </Button>
      </div>
    </section>
  );
}
