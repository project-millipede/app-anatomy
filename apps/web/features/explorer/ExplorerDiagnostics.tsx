'use client';

import type { StepKind } from '@apple-code/browser/native';
import type { OperationFeedback } from '../workspace/types';
import type { NativeTreeFailure } from './nativeTreeFailures';
import { ExplorerDiagnosticsLayout } from './layout/ExplorerDiagnosticsLayout';
import styles from './ExplorerDiagnostics.module.css';

type ExplorerDiagnosticsProps = {
  /** Current invocation and its original Rust outcome or host failure. */
  feedback: OperationFeedback;
  /** Independent loading failures already filtered to the current scope and invocation. */
  treeFailures: readonly NativeTreeFailure[];
};

type FailureItemProps = {
  /** Operation step or folder associated with this failure. */
  label: string;
  /** Original diagnostic text, including any formatted acquisition failures. */
  message: string;
};

/**
 * Compose current Explorer feedback within the stable diagnostics layout.
 * @param props Current operation feedback and independent folder-loading failures.
 * @returns The summary and failure sections supplied to the diagnostics layout.
 */
export function ExplorerDiagnostics({
  feedback,
  treeFailures,
}: ExplorerDiagnosticsProps) {
  const failedStepCount =
    feedback.outcome?.steps.reduce(
      (count, step) => count + (step.result.tag === 'err' ? 1 : 0),
      0,
    ) ?? 0;
  const issueCount =
    failedStepCount +
    treeFailures.length +
    (feedback.hostError === null ? 0 : 1);
  return (
    <ExplorerDiagnosticsLayout
      summary={formatDiagnosticsSummary(feedback.pending, issueCount)}
      hasIssues={issueCount > 0}
      details={
        <>
          {feedback.pending && (
            <p className={styles.empty}>Waiting for response…</p>
          )}
          {failedStepCount > 0 && (
            <section aria-label="Native operation failures">
              <h3 className={styles.sectionTitle}>Native operation</h3>
              <ol className={styles.failures}>
                {feedback.outcome?.steps.map((step, index) => {
                  if (step.result.tag !== 'err') return null;
                  return (
                    <FailureItem
                      key={`${index}:${step.kind}`}
                      label={getOperationStepLabel(step.kind)}
                      message={step.result.val.message}
                    />
                  );
                })}
              </ol>
            </section>
          )}
          {feedback.hostError !== null && (
            <section aria-label="Host execution failure">
              <h3 className={styles.sectionTitle}>
                Browser / component execution
              </h3>
              <ul className={styles.failures}>
                <FailureItem
                  label="Host execution"
                  message={feedback.hostError}
                />
              </ul>
            </section>
          )}
          {treeFailures.length > 0 && (
            <section aria-label="Folder loading failures">
              <h3 className={styles.sectionTitle}>Folder loading</h3>
              <ul className={styles.failures}>
                {treeFailures.map((failure, index) => (
                  <FailureItem
                    key={`${index}:${failure.nodeId}`}
                    label={failure.nodeName}
                    message={failure.error.message}
                  />
                ))}
              </ul>
            </section>
          )}
          {!feedback.pending && issueCount === 0 && (
            <p className={styles.empty}>No reported issues.</p>
          )}
        </>
      }
    />
  );
}

/**
 * Name a recorded operation step without classifying its diagnostic message.
 * @param kind Step identifier supplied by the generated component contract.
 * @returns The user-facing action label for that step.
 */
function getOperationStepLabel(kind: StepKind): string {
  switch (kind) {
    case 'select-file':
      return 'Select file';
    case 'select-directory':
      return 'Select folder';
    case 'open-entry':
      return 'Open entry';
    case 'query-selection':
      return 'Read current selection';
    case 'inspect':
      return 'Inspect file';
    case 'expand-directory':
      return 'Expand folder';
    case 'select-application':
      return 'Open application';
    case 'select-binary':
      return 'Open binary';
    default: {
      const unexpectedKind: never = kind;
      throw new Error(`Unknown operation step: ${unexpectedKind}`);
    }
  }
}

/**
 * Summarize operation state without exposing variable-length diagnostics inline.
 * @param pending Whether the current native invocation is awaiting a response.
 * @param issueCount Number of independently displayed failures across all sources.
 * @returns A short status suitable for the fixed-height diagnostics strip.
 */
function formatDiagnosticsSummary(
  pending: boolean,
  issueCount: number,
): string {
  if (issueCount === 0)
    return pending ? 'Waiting for response…' : 'No reported issues';

  const issueLabel = `${issueCount} ${issueCount === 1 ? 'issue' : 'issues'}`;
  if (pending) return `Waiting for response… · ${issueLabel}`;
  return `${issueLabel} · Current operation`;
}

/**
 * Keep one failure and its original diagnostic together in a named list item.
 * @param props The action label and unchanged diagnostic text.
 * @returns A failure row with keyboard-accessible technical details.
 */
function FailureItem({ label, message }: FailureItemProps) {
  return (
    <li className={styles.failure}>
      <p className={styles.failureLabel}>{label} — failed</p>
      <details className={styles.technicalDetails}>
        <summary>Technical details</summary>
        <p className={styles.message}>{message}</p>
      </details>
    </li>
  );
}
