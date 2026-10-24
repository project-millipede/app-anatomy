import { ErrorMessage } from './ErrorMessage';
import type { Outcome } from './types';

type OutcomeErrorsProps = {
  /** Complete Rust outcome, or null before an invocation returns. */
  outcome: Outcome | null;
  /** Presentation-specific styling for each error. */
  className?: string;
};

/**
 * Present failed steps in the order returned by Rust.
 * @param props The typed outcome and presentation styling.
 * @returns Alerts for failed steps, or nothing when no outcome is available.
 */
export function OutcomeErrors({ outcome, className }: OutcomeErrorsProps) {
  if (outcome === null) return null;

  return outcome.steps.map(({ result }, index) => {
    if (result.tag !== 'err') return null;

    return (
      <ErrorMessage
        key={index}
        message={result.val.message}
        className={className}
      />
    );
  });
}
