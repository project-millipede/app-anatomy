type ErrorMessageProps = {
  /** Error text supplied by the caller and displayed unchanged. */
  message: string;
  /** Presentation-specific styling for this error. */
  className?: string;
  /** Optional accessible name identifying this alert. */
  'aria-label'?: string;
};

/**
 * Display a supplied error message without interpreting it.
 * @param props The message, presentation styling and optional accessible name.
 * @returns An alert containing the supplied message.
 */
export function ErrorMessage({
  message,
  className,
  'aria-label': ariaLabel,
}: ErrorMessageProps) {
  return (
    <div role="alert" aria-label={ariaLabel} className={className}>
      {message}
    </div>
  );
}
