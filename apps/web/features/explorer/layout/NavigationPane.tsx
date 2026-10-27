import type { ReactNode } from 'react';
import styles from './NavigationPane.module.css';

type NavigationPaneProps = {
  /** Inventory heading and scope information. */
  heading: ReactNode;
  /** Instructions for using the file tree. */
  description: ReactNode;
  /** Physical file tree; this pane scrolls it within the remaining height. */
  tree: ReactNode;
  /** Scope information below the tree. */
  footer: ReactNode;
};

/**
 * Arrange the physical file navigation column.
 * Ark's TreeView root must contain both its label and tree, so the tree
 * component may wrap this whole pane in that root.
 * @param props Content for each navigation region.
 * @returns The navigation landmark with a scrolling tree region.
 */
export function NavigationPane({
  heading,
  description,
  tree,
  footer,
}: NavigationPaneProps) {
  return (
    <aside className={styles.pane} aria-label="Physical file navigation">
      <div className={styles.heading}>{heading}</div>
      <div className={styles.description}>{description}</div>
      <div className={styles.tree}>{tree}</div>
      <div className={styles.footer}>{footer}</div>
    </aside>
  );
}
