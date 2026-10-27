import type { ReactNode } from 'react';
import styles from './ExplorerWorkspaceLayout.module.css';

type ExplorerWorkspaceLayoutProps = {
  /** Physical tree column, normally a NavigationPane. */
  navigation: ReactNode;
  /** Relationship canvas column, normally a CanvasPane. */
  canvas: ReactNode;
  /** Connection details column, normally an InspectorPane. */
  inspector: ReactNode;
};

/** Arrange the named workspace panes in a 1:3:1 ratio at every width. */
export function ExplorerWorkspaceLayout({
  navigation,
  canvas,
  inspector,
}: ExplorerWorkspaceLayoutProps) {
  return (
    <div className={styles.workspace}>
      {navigation}
      {canvas}
      {inspector}
    </div>
  );
}
