import { Button } from '../workspace/ark/Button';
import { PlaceholderLines } from './Placeholder';
import { InspectorPane } from './layout/InspectorPane';
import styles from './ExplorerLayout.module.css';

/** Existing evidence placeholders and disabled actions in the inspector slots. */
export function ExplorerConnectionInspector() {
  return (
    <InspectorPane
      header={
        <div className={styles.inspectorHeading}>
          <span className={styles.placeholderEyebrow}>Connection details</span>
          <h2>Evidence inspector</h2>
          <p>The selected connection will be explained here.</p>
        </div>
      }
      sections={[
        'Original reference',
        'Resolution context',
        'Endpoint status',
      ].map((label) => (
        <section className={styles.inspectorSection} key={label}>
          <h3>{label}</h3>
          <PlaceholderLines count={3} />
        </section>
      ))}
      actions={
        <>
          <Button disabled>Reveal endpoint</Button>
          <Button disabled>Focus endpoint</Button>
        </>
      }
    />
  );
}
