import type { ReactNode } from 'react';
import styles from './CanvasPane.module.css';

type CanvasPaneProps = {
  /** Action that restores the previous exploration. */
  back: ReactNode;
  /** Exact location of the selected file. */
  location: ReactNode;
  /** Context that changes the displayed relationships, such as architecture. */
  context: ReactNode;
  /** Relationship canvas, normally a BridgeGrid. */
  canvas: ReactNode;
  /** Key explaining connection line styles. */
  legend: ReactNode;
  /** Announcement of the latest exploration change. */
  status: ReactNode;
};

/**
 * Arrange the relationship canvas column and its context bar.
 * The root layout's skip link targets this main landmark.
 * @param props Content for each canvas region.
 * @returns The main landmark with a persistent status region.
 */
export function CanvasPane({
  back,
  location,
  context,
  canvas,
  legend,
  status,
}: CanvasPaneProps) {
  return (
    <main id="workbench" className={styles.pane}>
      <div className={styles.contextBar}>
        {back}
        <div className={styles.location}>{location}</div>
        <div className={styles.context}>{context}</div>
      </div>
      {canvas}
      <div className={styles.legend}>{legend}</div>
      <div role="status" className={styles.status}>
        {status}
      </div>
    </main>
  );
}
