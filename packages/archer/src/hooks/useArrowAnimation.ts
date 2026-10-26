import { type RefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import { useRafLoop } from 'react-use';

/**
 * Ref whose `.current` holds a mutable `Set` of anchor‑point IDs.
 */
type SetRef = RefObject<Set<string>>;

/**
 * Test whether a given anchor ID belongs to the current arrow.
 *
 * @param anchorIdsRef - Ref that stores `{sourceId, targetId}`.
 * @param id           - Anchor‑point ID to test.
 * @returns `true` if `id` is one of the two anchor IDs; otherwise `false`.
 */
function isAnchorForArrow(anchorIdsRef: SetRef, id: string): boolean {
  const set = anchorIdsRef.current;
  return set ? set.has(id) : false;
}

/**
 * Mark an anchor as *currently animating*.
 *
 * @param activeAnchorIdsRef - Ref of the active‑anchor set.
 * @param id                 - Anchor‑point ID whose animation just started.
 * @returns `true` if the ID transitioned inactive → active; `false` if it was
 *          already active (duplicate `start` event).
 */
function markAnchorActive(activeAnchorIdsRef: SetRef, id: string): boolean {
  const set = activeAnchorIdsRef.current;
  if (set && !set.has(id)) {
    set.add(id);
    return true;
  }
  return false;
}

/**
 * Unmark an anchor as *currently animating*.
 *
 * @param activeAnchorIdsRef - Ref of the active‑anchor set.
 * @param id                 - Anchor‑point ID whose animation ended.
 * @returns `true` if the ID was removed; `false` if it wasn't active
 *          (stray or duplicate `end` event).
 */
function unmarkAnchorActive(activeAnchorIdsRef: SetRef, id: string): boolean {
  const set = activeAnchorIdsRef.current;
  return set ? set.delete(id) : false;
}

/**
 * Return `true` when **no** anchors are currently animating.
 */
function noActiveAnchors(activeAnchorIdsRef: SetRef): boolean {
  const set = activeAnchorIdsRef.current;
  return set ? set.size === 0 : true;
}

/**
 * Handle returned by {@link useArrowAnimation}. Consumers use these callbacks
 * to keep the arrow in sync with anchor animations.
 */
export type ArrowAnimationSyncHandle = {
  /**
   * Call exactly once when the anchor has been fully laid out but before the
   * browser paints the first frame of its CSS animation or transition.
   * This lets the arrow draw an initial, visually‑correct frame without
   * starting the RAF loop.
   */
  notifyAnimationInit(id: string): void;
  /**
   * Call on every `animationstart` event for this anchor.
   *
   * CSS transitions note:
   * - In most browsers `transitionstart` fires right after any transition delay
   *   and immediately before the first interpolated frame is painted.
   * - Firefox (as of 2025‑06) does not implement `transitionstart`.
   *   For consistent behaviour you can instead listen for `transitionrun`,
   *   which fires slightly earlier — still in the same event‑loop tick —
   *   ensuring the arrow redraws before any visual motion is shown.
   */
  notifyAnimationStart(id: string): void;

  /**
   * Call on every `animationend` or `animationcancel` for this anchor.
   *
   * CSS transitions note:
   * 1. Listen for `transitionend` — this event is supported in all browsers and
   *    fires when a CSS transition finishes naturally.
   * 2. Optionally listen for `transitioncancel` (Chrome 36+, Edge 79+,
   *    Safari 14.1+). Firefox has not implemented `transitioncancel` as of
   *    2025‑06.
   */
  notifyAnimationEnd(id: string): void;
  /**
   * `true` while at least one linked anchor is animating; `false` otherwise.
   */
  isAnimatingRef: RefObject<boolean>;
};

/**
 * Hook that manages a per‐arrow RAF loop and exposes callbacks so external
 * components can keep the SVG path in sync with anchor animations.
 *
 * Notification protocol
 * - `notifyAnimationInit` – Call immediately after an anchor has its first
 *   correct layout but before its CSS/JS animation begins.
 *   Effect: draw one frame (no RAF loop) so the arrow is accurate at t = 0 ms.
 *
 * - `notifyAnimationStart` – Call on every `animationstart` or
 *   `transitionstart` involving either the source or target anchor. If this is
 *   the first active anchor the hook will perform three steps:
 *   1. set `isAnimatingRef.current` to `true`,
 *   2. draw an immediate frame, and
 *   3. start the RAF loop. Duplicate `start` events for an already‑active
 *      anchor are ignored.
 *
 * - `notifyAnimationEnd` – Call on every `animationend` or `animationcancel`
 *   for the watched anchors. The hook removes the anchor from the active set.
 *   When no anchors remain active it performs three steps:
 *   1. set `isAnimatingRef.current` to `false`,
 *   2. draw a final frame, and
 *   3. stop the RAF loop. Events that do not correspond to an active animation
 *      (stray or duplicate `end`) are ignored.
 *
 * Duplicate or stray events are safely ignored via the helper return values,
 * ensuring the internal bookkeeping never drifts.
 *
 * @param updateCallback - Draw the latest geometry (path + label positions).
 * @param sourceId       - Tail anchor‑point ID.
 * @param targetId       - Head anchor‑point ID.
 * @returns Stable {@link ArrowAnimationSyncHandle}.
 */
export function useArrowAnimation(
  updateCallback: () => void,
  sourceId: string,
  targetId: string,
): ArrowAnimationSyncHandle {
  /**
   * Fixed pair `{sourceId, targetId}` that belongs to this arrow.
   */
  const anchorIdsRef = useRef<Set<string>>(new Set([sourceId, targetId]));

  /**
   * Subset of anchors that are currently animating.
   *
   * CRITICAL: We use a Set here, not a simple counter.
   * A counter is brittle and would cause bugs:
   * - Duplicate `start` events would prevent the loop from ever stopping.
   * - Stray `end` events could stop the loop while the other anchor is still
   *   moving.
   *
   * The Set correctly tracks the state of each anchor independently.
   */
  const activeAnchorIdsRef = useRef<Set<string>>(new Set());

  /**
   * Public flag; external readers won’t trigger re‑renders.
   */
  const isAnimatingRef = useRef<boolean>(false);

  /**
   * The `useRafLoop` hook requires a stable function, but `updateCallback` can
   * change on every render. Passing it directly would create a "stale closure,"
   * causing the animation to run with old data and appear to stutter.
   *
   * This ref acts as a stable pointer to the latest `updateCallback`, ensuring
   * the animation loop always executes the freshest drawing logic.
   */
  const updateFnRef = useRef(updateCallback);
  updateFnRef.current = updateCallback; // always point at freshest logic

  /**
   * A single, controllable animation loop for the arrow's lifetime. It's
   * initialized in a stopped state and managed by the `notify` handlers.
   */
  const [stopLoop, startLoop] = useRafLoop(() => updateFnRef.current(), false);

  const notifyAnimationInit = useCallback((id: string): void => {
    if (isAnchorForArrow(anchorIdsRef, id)) {
      updateFnRef.current();
    }
  }, []);

  const notifyAnimationStart = useCallback(
    (id: string): void => {
      if (
        !isAnchorForArrow(anchorIdsRef, id) ||
        !markAnchorActive(activeAnchorIdsRef, id)
      ) {
        return;
      }

      // First active anchor: spin everything up.
      if (!isAnimatingRef.current) {
        isAnimatingRef.current = true;
        updateFnRef.current(); // Draw immediately
        startLoop();
      }
    },
    [startLoop],
  );

  const notifyAnimationEnd = useCallback(
    (id: string): void => {
      if (
        !isAnchorForArrow(anchorIdsRef, id) ||
        !unmarkAnchorActive(activeAnchorIdsRef, id)
      ) {
        // Ignore if ID is not for this arrow or if it's a stray/duplicate end event.
        return;
      }

      // Last active animation finished: shut everything down.
      if (isAnimatingRef.current && noActiveAnchors(activeAnchorIdsRef)) {
        isAnimatingRef.current = false;
        updateFnRef.current();
        stopLoop();
      }
    },
    [stopLoop],
  );

  /**
   * Reset state when the arrow retargets a different source/target pair.
   *
   * This effect is critical for ensuring that when an arrow's endpoints
   * (`sourceId` or `targetId`) change, all previous animation state is cleared.
   *
   * NOTE:
   * `stopLoop` is intentionally omitted from the dependency array. This
   * effect's purpose is to reset state when the arrow's identity (defined by
   * `sourceId` and `targetId`) changes.
   * The `stopLoop` function from `useRafLoop` is stable and does not need to
   * trigger this reset logic. Including it would couple this effect to an
   * implementation detail rather than the semantic intent of retargeting the
   * arrow.
   */
  useEffect(() => {
    anchorIdsRef.current = new Set([sourceId, targetId]);
    activeAnchorIdsRef.current.clear();
    if (isAnimatingRef.current) {
      stopLoop();
    }
    isAnimatingRef.current = false;
  }, [sourceId, targetId]);

  /**
   * Ensure RAF loop stops if component unmounts while animating.
   */
  useEffect(
    () => () => {
      if (isAnimatingRef.current) {
        stopLoop();
      }
    },
    [stopLoop],
  );

  /**
   * Return a stable handle object.
   * This prevents consumers of the hook from triggering unnecessary re-renders
   * or effects when they use the handle as a dependency.
   */
  return useMemo<ArrowAnimationSyncHandle>(
    () => ({
      notifyAnimationInit,
      notifyAnimationStart,
      notifyAnimationEnd,
      isAnimatingRef,
    }),
    [notifyAnimationInit, notifyAnimationStart, notifyAnimationEnd],
  );
}
