import { afterEach, expect, test, vi } from 'vitest';
import * as engineLoader from '../packages/apple-code-browser/src/loader/engine';
import { createNativeRuntime } from '../packages/apple-code-browser/src/native/runtime';

afterEach(() => {
  vi.restoreAllMocks();
});

test('session access shares initialization and can retry a loading failure', async () => {
  // 1. Control engine initialization while keeping the real runtime behavior.
  const failure = new Error('Engine loading failed');
  const loading = Promise.withResolvers<engineLoader.Engine>();
  const prepareEngine = vi
    .spyOn(engineLoader, 'prepareEngine')
    .mockReturnValueOnce(loading.promise)
    .mockRejectedValue(failure);
  const runtime = createNativeRuntime();

  try {
    // 2. Both callers receive the failure from one shared initialization attempt.
    const first = expect(runtime.getSession()).rejects.toBe(failure);
    const second = expect(runtime.getSession()).rejects.toBe(failure);
    loading.reject(failure);
    await Promise.all([first, second]);
    expect(prepareEngine).toHaveBeenCalledTimes(1);

    // 3. A later caller starts a fresh attempt instead of reusing the rejection.
    await expect(runtime.getSession()).rejects.toBe(failure);
    expect(prepareEngine).toHaveBeenCalledTimes(2);
  } finally {
    runtime.dispose();
  }
});
