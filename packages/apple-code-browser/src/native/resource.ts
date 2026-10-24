/**
 * 1. Receive jco's drop hook for an owned resource.
 * 2. Forward cleanup to the wrapped provider.
 */
export abstract class ResourceAdapter<
  T extends Disposable,
> implements Disposable {
  protected readonly provider: T;

  protected constructor(provider: T) {
    this.provider = provider;
  }

  [Symbol.dispose](): void {
    this.provider[Symbol.dispose]();
  }
}
