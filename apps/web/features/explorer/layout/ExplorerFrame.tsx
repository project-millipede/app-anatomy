import type { ReactNode } from 'react';
import styles from './ExplorerFrame.module.css';

type ExplorerFrameProps = {
  /** Product identity at the start of the page header. */
  brand: ReactNode;
  /** Page-level actions at the end of the page header. */
  headerActions: ReactNode;
  /** Page heading and its description. */
  title: ReactNode;
  /** Key explaining the canvas axes, beside the title. */
  axisKey: ReactNode;
  /** Page-level scope notice above the workspace. */
  notice: ReactNode;
  /** Interactive workspace, which owns its named pane layout. */
  workspace: ReactNode;
  /** Scope notes at the end of the page. */
  footer: ReactNode;
};

/**
 * Arrange static page chrome around the independently composed workspace.
 * @param props Content for each page region.
 * @returns The explorer page with its named layout regions.
 */
export function ExplorerFrame({
  brand,
  headerActions,
  title,
  axisKey,
  notice,
  workspace,
  footer,
}: ExplorerFrameProps) {
  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        {brand}
        <div className={styles.headerActions}>{headerActions}</div>
      </header>
      <div className={styles.toolbar}>
        <div className={styles.title}>{title}</div>
        <div className={styles.axisKey}>{axisKey}</div>
      </div>
      <div className={styles.notice}>{notice}</div>
      {workspace}
      <footer className={styles.footer}>{footer}</footer>
    </div>
  );
}
