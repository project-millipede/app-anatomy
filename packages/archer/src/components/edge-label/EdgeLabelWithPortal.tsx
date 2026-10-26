import {
  type FC,
  type CSSProperties,
  useState,
  useRef,
  useMemo,
  useLayoutEffect,
  useImperativeHandle,
} from 'react';

import { createPortal } from 'react-dom';

import type { EdgeLabelProps } from './types';
import { attemptReposition } from '../../utils/position';

/**
 * CSS class added to the overlay element created by an `ArcherSurface`.
 * The overlay lives directly beside the surface’s content node and acts as a
 * host for all edge‑label portals.
 */
export const EDGE_LABEL_OVERLAY_CLASS = 'archer-edge-label-overlay';

const LABEL_BASE_STYLE: CSSProperties = {
  position: 'absolute',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  zIndex: 1,
  borderRadius: 4,
  padding: 4,
  lineHeight: 1,

  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * Retrieve the overlay element (`<div class="archer-edge-label-overlay">`) that
 * is a direct sibling of `surfaceContentElement`.
 *
 * Traversal steps:
 * 1. Access the parent of `surfaceContentElement`.
 * 2. Query that parent for `.archer-edge-label-overlay` using the scoped
 *    selector `:scope > .archer-edge-label-overlay`.
 *
 * Expected DOM structure:
 *
 * ```html
 * <div> <!-- parent -->
 *   <div><!-- surfaceContentElement --></div>
 *   <div class="archer-edge-label-overlay"></div>
 *   <svg></svg>
 * </div>
 * ```
 *
 * The `:scope >` prefix ensures we never wander up the tree, which keeps
 * multiple surfaces on the same page independent.
 *
 * @param surfaceContentElement - Any descendant element of the current
 *                                `ArcherSurface`.
 * @returns The sibling overlay element, or `null` if it has not mounted yet.
 */
export function getSiblingOverlayElement(
  surfaceContentElement: Element | null,
): Element | null {
  if (!surfaceContentElement) return null;

  const parentElement = surfaceContentElement.parentElement;
  if (!parentElement) return null;

  return (
    parentElement.querySelector<Element>(
      `:scope > .${EDGE_LABEL_OVERLAY_CLASS}`,
    ) ?? null
  );
}

/**
 * Position `node` so that its visual centre aligns with the point (`x`, `y`)
 * in the overlay’s coordinate space.
 *
 * How it works:
 * 1. `translate(-50%, -50%)` shifts the element up / left by half its own width
 *    & height, moving the local origin from the top-left corner to the centre.
 * 2. `translate(<x>px, <y>px)` then moves that centre to the target
 *    coordinates.
 *
 * Why we always write *both* parts:
 * `transform` is a single property composited by the **GPU Compositor**.
 * Replacing the entire string on every call keeps the order `centre-shift →
 * pixel-shift` intact and costs no extra layout or paint — the browser merely
 * swaps the GPU layer’s transform matrix.  Trying to edit “just the second
 * translate” would still rebuild the string, so there’s no performance upside
 * in splitting the two operations.
 *
 * @param node – Element to reposition. No-op if `null`.
 * @param x    – X-coordinate in overlay space.
 * @param y    – Y-coordinate in overlay space.
 * @returns    void
 */
function centerOnPoint(node: HTMLElement | null, x: number, y: number): void {
  if (!node) return;
  node.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
}

/**
 * EdgeLabelWithPortal – a lightweight, portal‑based label component for
 * SVG‑backed diagrams.
 *
 * Instead of embedding the label inside the `<svg>` itself, the element is
 * portalled into a sibling overlay `<div>` that sits in normal HTML flow.
 * This sidesteps `<foreignObject>` headaches and avoids any `getBBox` geometry
 * reads, so labels can be styled like ordinary DOM nodes.
 *
 * Design goals:
 * - Zero geometry reads:
 *   The caller already knows the desired `(x, y)`, so we can position the label
 *   with a pure CSS transform.
 * - Render‑skipping updates:
 *   An imperative `updatePosition()` method lets external code (drag handles,
 *   animation libraries, etc.) move the label by mutating `style.transform`
 *   directly, avoiding React re‑renders between frames.
 * - Overlay isolation:
 *   Every diagram surface owns its own overlay; we locate it with a `:scope >`
 *   selector so multiple surfaces on the same page never clash.
 */
export const EdgeLabelWithPortal: FC<EdgeLabelProps> = ({
  x,
  y,
  rectFill = '#f44336',
  onLabelClick,
  dynamicRef,
  surfaceContentRef,
  children,
}) => {
  const labelElementRef = useRef<HTMLDivElement>(null);
  const lastPositionRef = useRef<{ x: number; y: number } | null>(null);

  const [overlayRootElement, setOverlayRootElement] = useState<Element | null>(
    null,
  );

  const labelStyle = useMemo<CSSProperties>(() => {
    return {
      ...LABEL_BASE_STYLE,
      background: rectFill ?? 'transparent',
    };
  }, [rectFill]);

  useLayoutEffect(() => {
    if (!surfaceContentRef) return;
    // Find the overlay once on mount.
    const overlay = getSiblingOverlayElement(surfaceContentRef.current);
    setOverlayRootElement(overlay);

    if (!overlay) {
      // If the overlay is not present yet (or has been removed), invalidate the
      // cached coordinates so the next reposition starts fresh.
      lastPositionRef.current = null;
    }

    return () => {
      // Effect teardown (component unmounted or deps changed):
      // Drop cached coordinates.
      lastPositionRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (overlayRootElement) {
      // Sync label position whenever (x, y) or the overlay element changes.
      attemptReposition(
        labelElementRef.current,
        x,
        y,
        lastPositionRef,
        centerOnPoint,
      );
    }
  }, [overlayRootElement, x, y]);

  useImperativeHandle(
    dynamicRef,
    () => ({
      // Expose an imperative handle so external code can move the label without
      // triggering a React re-render.
      updatePosition: (x: number, y: number) => {
        attemptReposition(
          labelElementRef.current,
          x,
          y,
          lastPositionRef,
          centerOnPoint,
        );
      },
    }),
    [],
  );

  if (!overlayRootElement) return null;

  return createPortal(
    <div
      ref={labelElementRef}
      style={labelStyle}
      onClick={() => {
        onLabelClick?.();
      }}
    >
      <span
        style={{
          fontSize: '12px',
        }}
      >
        {children}
      </span>
    </div>,
    overlayRootElement,
  );
};
