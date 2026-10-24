import { prepareEngine, type EngineOptions } from '../loader/engine';
import type { Session } from '../../generated/interfaces/apple-code-analysis-native.js';

export type NativeRuntimeOptions = Pick<
  EngineOptions,
  'assetBaseUrl' | 'loadModule'
>;

// jco's declarations describe synchronous Session methods; JSPI makes their calls
// asynchronous. Preserve the generated operations and adapt only their results.
export type AsyncSession = {
  [K in keyof Session]: Session[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : Session[K];
};

/**
 * Session initialization and access share one state:
 *
 * 1. Promise: initialization is running or has completed. Concurrent callers
 *    share the same attempt and, on success, the same generated Session.
 * 2. undefined: no Session is cached. Initialization may start on demand.
 *    A failed attempt restores this state so a later call can retry.
 * 3. null: dispose() has permanently ended access through this runtime.
 *    Neither successful initialization nor a late failure may reopen access.
 *    Previously returned Sessions remain usable.
 *
 * Use === undefined to allow initialization and === null to reject access.
 * Do not use truthiness, == null or ??= for this decision: they treat both
 * absence states alike, although only undefined permits initialization.
 */
type SessionState = Promise<AsyncSession> | undefined | null;

/**
 * Lazily initialize one component and cache its generated Session.
 * @param options Wasm asset location and optional module loader.
 * @returns Shared session access and a method to permanently end that access.
 */
export function createNativeRuntime(options: NativeRuntimeOptions = {}) {
  let sessionState: SessionState = undefined;

  async function load(): Promise<AsyncSession> {
    const engine = await prepareEngine(options);
    // Runtime access may have ended while loading; do not create a Session then.
    if (sessionState === null)
      throw new Error('Access to this runtime has ended.');
    return engine.native.createSelectionSession() as unknown as AsyncSession;
  }

  /**
   * 1. Refuse access after it has permanently ended.
   * 2. Initialize once and share the generated Session across callers.
   * 3. Allow retries after failure only while runtime access remains available.
   * 4. Recheck access before returning the Session to a waiting caller.
   */
  async function getSession(): Promise<AsyncSession> {
    if (sessionState === null)
      throw new Error('Access to this runtime has ended.');

    if (sessionState === undefined) {
      sessionState = load().catch((failure) => {
        // A late failure must not restore access after cleanup.
        if (sessionState !== null) sessionState = undefined;
        throw failure;
      });
    }

    return sessionState.then((session) => {
      if (sessionState === null)
        throw new Error('Access to this runtime has ended.');
      return session;
    });
  }

  /**
   * 1. Permanently refuse further access through getSession().
   * 2. Release this runtime's reference to the cached Session promise.
   *
   * Already returned Sessions remain usable. This does not cancel initialization
   * or pending operations, or force socket closure. Owned resource drops still
   * forward cleanup to Polymorph through ResourceAdapter.
   */
  function dispose(): void {
    sessionState = null;
  }

  return { getSession, dispose };
}

export type NativeRuntime = ReturnType<typeof createNativeRuntime>;
