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
          Ark workspace · Layout preview
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
      notice="Interactive preview · The tree uses authored example nodes. Evidence panels are placeholders; connections illustrate positioning only."
      workspace={<ExplorerWorkspace />}
      footer={
        <>
          <span>Application Explorer · Layout preview</span>
          <span>Illustrative connections · No files inspected</span>
        </>
      }
    />
  );
}
