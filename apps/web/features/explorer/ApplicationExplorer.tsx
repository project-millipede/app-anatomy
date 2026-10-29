import { ExplorerWorkspace } from './ExplorerWorkspace';
import { ExplorerFrame } from './layout/ExplorerFrame';
import styles from './ExplorerLayout.module.css';

/** Compose static Explorer chrome around the interactive workspace. */
export function ApplicationExplorer() {
  return (
    <ExplorerFrame
      brand={
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            ⌘
          </span>
          <div>
            <strong>CODE WORKBENCH</strong>
            <span>Application anatomy</span>
          </div>
        </div>
      }
      headerActions={
        <span className={styles.headerMeta}>
          Ark workspace · Synthetic relationships
        </span>
      }
      title={
        <>
          <h1>Application Explorer</h1>
          <p>One selected resource. Four directions to explore.</p>
        </>
      }
      axisKey={
        <div className={styles.toolbarActions} aria-label="Relationship axes">
          <span>↔ Internal resources</span>
          <span>↕ External / unresolved</span>
        </div>
      }
      notice="Synthetic preview · Rust computes bounded dependency candidates from authored inventory facts. No files are acquired; results do not establish runtime loading."
      workspace={<ExplorerWorkspace />}
      footer={
        <>
          <span>Application Explorer · Synthetic preview</span>
          <span>Rust-computed candidates · No files inspected</span>
        </>
      }
    />
  );
}
