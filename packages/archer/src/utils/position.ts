import type { RefObject } from 'react';

/**
 * Reposition `node` **only** when its target coordinates differ from the last
 * applied ones. The actual transform logic is supplied via `applyTransform`,
 * so this helper works for HTML, SVG, Canvas—anything with a DOM handle.
 *
 * @template T – The specific `Element` subtype (e.g. `HTMLElement`, `SVGGElement`).
 * @param node           – Element to move (may be `null` pre-mount).
 * @param x              – Desired X coordinate.
 * @param y              – Desired Y coordinate.
 * @param lastRef        – Ref storing the last `{ x, y }` written.
 * @param applyTransform – Function that mutates `node` to sit at `(x, y)`.
 */
export function attemptReposition<T extends Element>(
  node: T | null,
  x: number,
  y: number,
  lastRef: RefObject<{ x: number; y: number } | null>,
  applyTransform: (node: T | null, x: number, y: number) => void,
): void {
  // 1. Abort early if the element hasn’t mounted yet.
  if (!node) return;

  // 2. Decide if a position update is required.
  const hasPositionChanged =
    // 2a. First-ever run – nothing cached.
    !lastRef.current ||
    // 2b. X moved.
    lastRef.current.x !== x ||
    // 2c. Y moved.
    lastRef.current.y !== y;

  // 3. Bail out when nothing changed.
  if (!hasPositionChanged) return;

  // 4. Delegate the concrete transform mutation.
  applyTransform(node, x, y);

  // 5. Cache these coords so identical calls become no-ops.
  lastRef.current = { x, y };
}

/**
 * Resize a background `<rect>` so that it hugs a `<text>` element with the
 * given padding – but *only* when the text’s bounding-box size has actually
 * changed since the last run.
 *
 * @param textNode  – The `<text>` element to measure.
 * @param rectNode  – The sibling `<rect>` element to resize.
 * @param paddingX  – Horizontal padding (per side).
 * @param paddingY  – Vertical padding (per side).
 * @param lastRef   – Ref caching the last rounded `{ width, height }` applied.
 */
export function attemptResizeRect(
  textNode: SVGTextElement | null,
  rectNode: SVGRectElement | null,
  paddingX: number,
  paddingY: number,
  lastRef: RefObject<{ width: number; height: number } | null>,
): void {
  // 1. Abort early if either element is not yet mounted.
  if (!textNode || !rectNode) return;

  // 2. Measure the text’s raw bounding box.
  const { width: rawWidth, height: rawHeight } = textNode.getBBox();
  // Round to whole pixels to avoid sub-pixel cache churn.
  const width = Math.round(rawWidth);
  const height = Math.round(rawHeight);

  // 3. Decide if a size update is required.
  const hasSizeChanged =
    !lastRef.current ||
    lastRef.current.width !== width ||
    lastRef.current.height !== height;

  // 4. Bail out when nothing changed.
  if (!hasSizeChanged) return;

  // 5. Compute the padded rectangle dimensions.
  const paddedWidth = width + paddingX * 2;
  const paddedHeight = height + paddingY * 2;

  // 6. Write the new geometry.
  rectNode.setAttribute('width', `${paddedWidth}`);
  rectNode.setAttribute('height', `${paddedHeight}`);
  // Centre the rect around the group’s origin.
  rectNode.setAttribute('x', `${-paddedWidth / 2}`);
  rectNode.setAttribute('y', `${-paddedHeight / 2}`);

  // 7. Cache the rounded size so identical calls become no-ops.
  lastRef.current = { width, height };
}
