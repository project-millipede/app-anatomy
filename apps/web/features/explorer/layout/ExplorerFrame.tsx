import type { ReactNode } from 'react';
import styles from './ExplorerFrame.module.css';

type ExplorerFrameProps = {
  /** Page heading and its description. */
  title: ReactNode;
  /** Source selection and task actions beside the title. */
  controls: ReactNode;
  /** Page-level scope notice above the workspace. */
  notice: ReactNode;
  /** Interactive workspace, which owns its named pane layout. */
  workspace: ReactNode;
  /** Stable operation feedback, outside the workspace's canvas geometry. */
  diagnostics: ReactNode;
  /** Scope notes at the end of the page. */
  footer: ReactNode;
};

/**
 * Arrange static page chrome around the independently composed workspace.
 * @param props Content for each page region.
 * @returns The explorer page with its named layout regions.
 */
export function ExplorerFrame({
  title,
  controls,
  notice,
  workspace,
  diagnostics,
  footer,
}: ExplorerFrameProps) {
  return (
    <div className={styles.frame}>
      <div className={styles.toolbar}>
        <div className={styles.title}>{title}</div>
        <div className={styles.controls}>{controls}</div>
      </div>
      <div className={styles.notice}>{notice}</div>
      {workspace}
      <div className={styles.diagnostics}>{diagnostics}</div>
      <footer className={styles.footer}>{footer}</footer>
    </div>
  );
}
