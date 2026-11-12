import type { ReactNode } from 'react';
import styles from './ExplorerOverviewLayout.module.css';

type ExplorerOverviewLayoutProps = {
  /** Application metadata and the dataset selector inside the header. */
  header: ReactNode;
  /** Term/description groups inside the summary definition list. */
  summary: ReactNode;
  /** Context selector and recorded context facts. */
  context: ReactNode;
  /** Read-only architecture coverage and its supporting details. */
  coverage: ReactNode;
};

/**
 * Arrange Overview content with context beside coverage, or above it when narrow.
 * @param props Content for each named Overview region.
 * @returns The scrollable main landmark and its responsive layout.
 */
export function ExplorerOverviewLayout({
  header,
  summary,
  context,
  coverage,
}: ExplorerOverviewLayoutProps) {
  return (
    <main className={styles.overview}>
      <header className={styles.overviewHeader}>{header}</header>
      <dl className={styles.summary}>{summary}</dl>
      <div className={styles.overviewBody}>
        <div className={styles.context}>{context}</div>
        <div className={styles.coverage}>{coverage}</div>
      </div>
    </main>
  );
}
