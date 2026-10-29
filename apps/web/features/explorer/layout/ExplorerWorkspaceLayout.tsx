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

/** Keep readable sidebar widths around a fluid canvas; stack on narrow screens. */
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
