import { ExplorerWorkspace } from './ExplorerWorkspace';
import { ExplorerFrame } from './layout/ExplorerFrame';
import styles from './ExplorerLayout.module.css';

/** Compose static Explorer chrome around the interactive workspace. */
export function ApplicationExplorer() {
  return (
    <ExplorerFrame
      brand={null}
      headerActions={null}
      title={
        <>
          <h1>Application Explorer</h1>
          <p>
            Related resources follow in the tree. One selected file stays at the
            center.
          </p>
        </>
      }
      axisKey={
        <div className={styles.toolbarActions} aria-label="Relationship axes">
          <span>↔ Internal resources</span>
          <span>↕ External / unresolved</span>
        </div>
      }
      notice="Synthetic preview · Rust-computed candidates from authored inventory facts. No files acquired or runtime loading observed."
      workspace={<ExplorerWorkspace />}
      footer={
        <>
          <span>Application Explorer · Authored synthetic data</span>
          <span>Rust-computed candidates · No files inspected</span>
        </>
      }
    />
  );
}
