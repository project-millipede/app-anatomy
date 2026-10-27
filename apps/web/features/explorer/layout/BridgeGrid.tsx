import type { ReactNode } from 'react';
import styles from './BridgeGrid.module.css';

/** Keep the drawing surface and its grid together inside a horizontal scroll region. */
export function BridgeViewport({ children }: { children: ReactNode }) {
  return (
    <div
      className={styles.viewport}
      role="region"
      aria-label="Four-bridge relationship canvas; scroll horizontally on narrow screens"
      tabIndex={0}
    >
      <div className={styles.surface}>{children}</div>
    </div>
  );
}

type BridgeGridProps = {
  /** External sources referring to the selected file, above it. */
  north: ReactNode;
  /** Internal sources referring to the selected file, to its left. */
  west: ReactNode;
  /** The selected file at the center. */
  focus: ReactNode;
  /** Internal targets of the selected file, to its right. */
  east: ReactNode;
  /** External or unresolved references of the selected file, below it. */
  south: ReactNode;
};

/**
 * Place the four bridges around the selected file.
 * @param props Content for each bridge and the selected file.
 * @returns The directional grid, ready to be placed inside a drawing surface.
 */
export function BridgeGrid({
  north,
  west,
  focus,
  east,
  south,
}: BridgeGridProps) {
  return (
    <div className={styles.grid}>
      <div className={styles.boundary} aria-hidden="true">
        <span>Inside the application</span>
      </div>
      <div className={styles.north}>{north}</div>
      <div className={styles.west}>{west}</div>
      <section className={styles.focus} aria-label="Selected file">
        {focus}
      </section>
      <div className={styles.east}>{east}</div>
      <div className={styles.south}>{south}</div>
    </div>
  );
}
