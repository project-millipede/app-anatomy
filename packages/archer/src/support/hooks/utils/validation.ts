/**
 * Does the entry expose `borderBoxSize` at all?
 *
 * Versions
 * - Safari (macOS/iOS) ≤15.3 — property *missing* (undefined) ❌
 * - Safari (macOS/iOS) 15.4+ — present ✅
 * - Chromium/Edge 84+ — present ✅
 * - Firefox 92+ — present ✅
 */
export function hasBorderBox(entry: ResizeObserverEntry): boolean {
  return 'borderBoxSize' in entry;
}
