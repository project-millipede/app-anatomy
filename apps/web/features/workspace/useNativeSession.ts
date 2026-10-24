'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { AsyncSession, NativeRuntime } from '@apple-code/browser/native';
import { loadNativeEngine } from './nativeEngine';

/**
 * Own the application's component runtime independently of its presentations.
 * @returns A stable accessor for the generated session; this hook owns disposal.
 */
export function useNativeSession() {
  const nativeRuntimePromise = useRef<Promise<NativeRuntime | null>>(null);

  useEffect(() => {
    let runtime: NativeRuntime | null = null;

    const runtimePromise: Promise<NativeRuntime | null> =
      loadNativeEngine().then((engine) => {
        // The import may finish after this effect's cleanup has run.
        // Create the runtime only if this initialization is still current.
        if (nativeRuntimePromise.current !== runtimePromise) return null;
        runtime = engine.createNativeRuntime({
          assetBaseUrl: new URL('/engine/', window.location.origin),
        });
        return runtime;
      });
    nativeRuntimePromise.current = runtimePromise;

    return () => {
      // Prevent an import that finishes after cleanup from creating a runtime.
      nativeRuntimePromise.current = null;
      // Stop this runtime's browser connections.
      // The native service keeps its selected file or folder.
      runtime?.dispose();
      runtime = null;
    };
  }, []);

  /**
   * Obtain this owner's generated WIT session without recreating it for each call.
   * @returns The session, or null when no runtime is available.
   * @throws When importing, component initialization or runtime access fails.
   */
  const getNativeSession =
    useCallback(async (): Promise<AsyncSession | null> => {
      const runtime = await nativeRuntimePromise.current;
      return runtime ? runtime.getSession() : null;
    }, []);

  return { getNativeSession };
}
