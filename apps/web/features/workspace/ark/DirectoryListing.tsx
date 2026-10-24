import { Button } from './Button';
import styles from './Workbench.module.css';
import type { DirectoryListingProps } from '../types';

/**
 * Present a Rust-supplied listing and forward entry choices to the workbench.
 * @param props Non-null listing, pending state and the entry-selection callback.
 * @returns Folder entries, or an empty-folder message when the listing is empty.
 */
export function DirectoryListing({
  directory,
  operationPending,
  openNativeEntry,
}: DirectoryListingProps) {
  return (
    <section aria-label="Selected folder">
      <div className={styles.sectionLabel}>NATIVE FOLDER</div>
      <p className={styles.note}>{directory.name}</p>
      <p className={styles.sidebarHint}>
        Immediate entries only. Open a folder to view its contents, or choose a
        regular file to analyze.
      </p>
      {directory.entries.length === 0 ? (
        <p className={styles.sidebarHint}>This folder is empty.</p>
      ) : (
        <ul className={`${styles.artifacts} ${styles.folderEntries}`}>
          {directory.entries.map((item) => (
            <li key={item.id}>
              <Button
                variant="artifact"
                disabled={
                  operationPending ||
                  (item.kind !== 'file' && item.kind !== 'directory')
                }
                onClick={() => openNativeEntry(item.id)}
              >
                <span>{item.name}</span>
                <small>
                  {item.kind === 'directory' ? 'Open folder' : item.kind}
                </small>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
