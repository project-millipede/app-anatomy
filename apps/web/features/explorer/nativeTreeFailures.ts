import { DirectoryExpansionError } from '../workspace/DirectoryExpansionError';

/** A local tree failure with the invocation and scope that produced it. */
export type NativeTreeFailure = {
  /** Native invocation identity; null before any invocation was admitted. */
  readonly operation: object | null;
  /** Acquired application or standalone file owning the displayed tree. */
  readonly scopeResource: string | null;
  /** Tree entry whose children could not be displayed. */
  readonly nodeId: string;
  /** Recorded display name of the entry. */
  readonly nodeName: string;
  /** Original local failure; identity distinguishes repeated callback delivery. */
  readonly error: Error;
};

/** Preserve loader lifetime until Ark delivers its batch of failed nodes. */
export class NativeTreeLoadError extends Error {
  /**
   * @param failure Expansion failure with its explicit reporting owner.
   * @param signal Ark's loader signal; an abandoned load must not publish feedback.
   */
  constructor(
    readonly failure: DirectoryExpansionError,
    readonly signal: AbortSignal,
  ) {
    super(failure.message, { cause: failure });
    this.name = 'NativeTreeLoadError';
  }
}
