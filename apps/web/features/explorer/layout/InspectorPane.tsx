import type { ReactNode } from 'react';
import styles from './InspectorPane.module.css';

type InspectorPaneProps = {
  /** The active connection's endpoints, bridge and evidence state. */
  header: ReactNode;
  /** Evidence sections, separated in the order supplied. */
  sections: ReactNode;
  /** Actions that reveal or focus the connection's other endpoint. */
  actions: ReactNode;
};

/**
 * Arrange connection details outside the graph.
 * @param props Content for each inspector region.
 * @returns A focusable landmark that scrolls within its column.
 */
export function InspectorPane({
  header,
  sections,
  actions,
}: InspectorPaneProps) {
  return (
    // Focusable so keyboard users can scroll details taller than the column.
    <aside
      className={styles.pane}
      aria-label="Connection details; outside the graph"
      tabIndex={0}
    >
      <div className={styles.header}>{header}</div>
      <div className={styles.sections}>{sections}</div>
      <div className={styles.actions}>{actions}</div>
    </aside>
  );
}
