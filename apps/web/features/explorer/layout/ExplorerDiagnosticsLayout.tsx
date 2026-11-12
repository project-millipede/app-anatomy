'use client';

import { useRef, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import styles from './ExplorerDiagnosticsLayout.module.css';

type ExplorerDiagnosticsLayoutProps = {
  /** Short status announced within the fixed-height strip. */
  readonly summary: string;
  /** Whether the summary should use issue styling. */
  readonly hasIssues: boolean;
  /** Failure sections and pending or empty feedback inside the panel. */
  readonly details: ReactNode;
};

/**
 * Arrange diagnostics without changing the relationship canvas geometry.
 * @param props Summary, issue styling and content for the details region.
 * @returns A stable status strip and an explicitly opened, nonmodal details panel.
 */
export function ExplorerDiagnosticsLayout({
  summary,
  hasIssues,
  details,
}: ExplorerDiagnosticsLayoutProps) {
  const stripRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={stripRef} className={styles.strip}>
      <Dialog.Root modal={false} disablePointerDismissal>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className={styles.summary}
          data-has-issues={hasIssues || undefined}
        >
          {summary}
        </p>
        <Dialog.Trigger className={styles.button}>Details</Dialog.Trigger>
        <Dialog.Portal container={stripRef} className={styles.portal}>
          <Dialog.Popup className={styles.panel}>
            <header className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Explorer diagnostics</p>
                <Dialog.Title className={styles.title}>
                  Current operation details
                </Dialog.Title>
              </div>
              <Dialog.Close className={styles.button}>Close</Dialog.Close>
            </header>
            <Dialog.Description className={styles.description}>
              Current native operation and folder-loading feedback.
            </Dialog.Description>
            <div className={styles.content}>{details}</div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
