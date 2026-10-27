import { useId, type ReactNode } from 'react';
import styles from './BridgeGrid.module.css';

export type BridgePosition = 'north' | 'west' | 'east' | 'south';

const compass = { north: 'N', west: 'W', east: 'E', south: 'S' } as const;

type BridgeSectionProps = {
  /** Side of the selected file; sets the compass mark and its relationship color. */
  position: BridgePosition;
  /** Bridge name used as the section heading. */
  title: string;
  /** Kind of relationship crossing this bridge. */
  description: string;
  /** Relationships crossing this bridge. */
  children: ReactNode;
};

/**
 * Label one bridge and hold its relationships.
 * @param props The bridge's side, heading, description and relationships.
 * @returns A section named by its heading.
 */
export function BridgeSection({
  position,
  title,
  description,
  children,
}: BridgeSectionProps) {
  const titleId = useId();
  return (
    <section
      className={styles.bridge}
      data-position={position}
      aria-labelledby={titleId}
    >
      <div className={styles.heading}>
        <span className={styles.compass} aria-hidden="true">
          {compass[position]}
        </span>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
