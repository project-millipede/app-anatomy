import type * as NativeEngine from '@apple-code/browser/native';

/**
 * Load the published adapter without bundling another copy of the jco bridge.
 * @returns The adapter module; importing it does not create a component instance.
 */
export function loadNativeEngine(): Promise<typeof NativeEngine> {
  const url = new URL('/engine/native.mjs', window.location.origin).href;
  return import(/* webpackIgnore: true */ url);
}
