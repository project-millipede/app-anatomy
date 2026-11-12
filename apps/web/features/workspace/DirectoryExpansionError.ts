/**
 * Reject a tree load without reporting a native invocation's failure twice.
 * This identifies the UI reporting owner, not the meaning of a Rust error.
 */
export class DirectoryExpansionError extends Error {
  /** Invocation associated with this load, or null before an invocation exists. */
  readonly operation: object | null;
  /** Whether the model already reported this failure or the tree must report it. */
  readonly reportingOwner: 'operation' | 'tree';

  /**
   * Associate an unsuccessful load with its existing reporting boundary.
   * @param message Original diagnostic or a local tree-loading explanation.
   * @param operation Invocation identity retained when the load was attempted.
   * @param reportingOwner Owner responsible for presenting this failure.
   */
  constructor(
    message: string,
    operation: object | null,
    reportingOwner: 'operation' | 'tree',
  ) {
    super(message);
    this.name = 'DirectoryExpansionError';
    this.operation = operation;
    this.reportingOwner = reportingOwner;
  }
}
