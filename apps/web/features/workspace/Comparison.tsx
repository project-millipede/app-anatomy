import { Workbench as BaseWorkbench } from './base/Workbench';
import { Workbench as ArkWorkbench } from './ark/Workbench';
import styles from './Comparison.module.css';
import type { WorkbenchModel } from './types';

export function Comparison({ model }: { model: WorkbenchModel }) {
  return (
    <main id="workbench" className={styles.page}>
      <div className={styles.heading}>
        <div>
          <h1>Compare the workbench</h1>
          <p>
            Both views present the same selection, analysis result and operation
            state. Actions in either pane update both presentations.
          </p>
        </div>
      </div>
      <div className={styles.panes}>
        <section aria-labelledby="base-heading" className={styles.pane}>
          <header className={styles.paneHeader}>
            <h2 id="base-heading">Base UI</h2>
            <p>Existing controls · CSS Modules</p>
          </header>
          <BaseWorkbench model={model} embedded />
        </section>
        <section aria-labelledby="ark-heading" className={styles.pane}>
          <header className={styles.paneHeader}>
            <h2 id="ark-heading">Ark + Panda</h2>
            <p>Ark controls · Panda recipes · CSS Module layout</p>
          </header>
          <ArkWorkbench model={model} embedded />
        </section>
      </div>
      <p className={styles.note}>
        The palette and layout are intentionally matched. Compare focus, tabs
        and selection here; use the full-width views to compare all controls.
      </p>
    </main>
  );
}
