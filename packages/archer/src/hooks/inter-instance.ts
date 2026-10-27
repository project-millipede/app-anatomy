import {
  InterContainerElbowInstruction,
  InterContainerPathInstruction,
  InterContainerUTurnInstruction,
  IPoint,
  TAnchorPosition,
} from '../types';
import { Point } from '../utils/Point';
import { areGeometricallyAligned, areOpposingAnchors } from './utils';

const TURN_OUT_DISTANCE = 6;
const PADDING = TURN_OUT_DISTANCE;

/**
 * Calculates a "virtual" bounding rectangle that minimally encompasses two
 * separate DOM elements.
 *
 * This utility is essential for routing logic that needs to treat a group of
 * disparate elements as a single geometric entity for calculations like finding
 * a collective center point or an outer boundary.
 *
 * The resulting rectangle's properties are determined by:
 * - `left`/`top`: The minimum of the two elements' `left`/`top` values.
 * - `right`/`bottom`: The maximum of the two elements' `right`/`bottom` values.
 *
 * @param elementA The first DOM element to include in the boundary.
 * @param elementB The second DOM element to include in the boundary.
 * @returns A `DOMRect`-like object representing the combined boundary, or `null`
 *          if either element is not provided.
 */
export function getVirtualContainerRect(
  elementA: Element | null,
  elementB: Element | null,
): DOMRect | null {
  // A valid DOM element is required for both inputs.
  if (!elementA || !elementB) {
    return null;
  }

  const rectA = elementA.getBoundingClientRect();
  const rectB = elementB.getBoundingClientRect();

  /**
   * The properties of the combined rectangle are calculated by finding the
   * outermost extent of the two individual rectangles.
   */
  const left = Math.min(rectA.left, rectB.left);
  const top = Math.min(rectA.top, rectB.top);
  const right = Math.max(rectA.right, rectB.right);
  const bottom = Math.max(rectA.bottom, rectB.bottom);

  const width = right - left;
  const height = bottom - top;

  /**
   * An object that mimics the `DOMRect` interface is returned, ensuring it can
   * be used by other geometry functions that expect this shape.
   */
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    x: left,
    y: top,
    toJSON: () =>
      JSON.stringify({
        left,
        top,
        right,
        bottom,
        width,
        height,
        x: left,
        y: top,
      }),
  };
}

/**
 * The "Mechanic" for box paths. Calculates the necessary `loopSide` and
 * `loopBoundary` required to draw a wide, container-aware box path.
 *
 * This function's implementation does not change in the new architecture.
 * Its purpose remains to be a focused calculator for a specific task.
 */
export function calculateBoxPathParameters(
  sourceElement: Element,
  targetElement: Element,
  sourceContainer: Element,
  targetContainer: Element,
  sourcePoint: IPoint,
  sourceAnchor: TAnchorPosition,
  parentCoordinates: Point,
): { loopSide: TAnchorPosition; loopBoundary: number } | null {
  const containerVirtualRect = getVirtualContainerRect(
    sourceContainer,
    targetContainer,
  );
  const elementVirtualRect = getVirtualContainerRect(
    sourceElement,
    targetElement,
  );

  if (!containerVirtualRect || !elementVirtualRect) {
    console.error('-> BoxCalc: Failed to calculate virtual rectangles.');
    return null;
  }

  // --- Determine Loop Direction ---
  const virtualContainerCenterX =
    containerVirtualRect.left +
    containerVirtualRect.width / 2 -
    parentCoordinates.x;
  const virtualContainerCenterY =
    containerVirtualRect.top +
    containerVirtualRect.height / 2 -
    parentCoordinates.y;
  const isSourceInTopHalf = sourcePoint.y < virtualContainerCenterY;
  const isSourceInLeftHalf = sourcePoint.x < virtualContainerCenterX;
  const isLogicallyHorizontal =
    sourceAnchor === 'left' || sourceAnchor === 'right';

  let loopSide: TAnchorPosition;
  if (isLogicallyHorizontal) {
    loopSide = isSourceInTopHalf ? 'bottom' : 'top';
  } else {
    loopSide = isSourceInLeftHalf ? 'right' : 'left';
  }

  // --- Calculate Loop Boundary ---
  let loopBoundary: number;
  switch (loopSide) {
    case 'bottom':
      loopBoundary = elementVirtualRect.bottom + PADDING;
      break;
    case 'top':
      loopBoundary = elementVirtualRect.top - PADDING;
      break;
    case 'right':
      loopBoundary = elementVirtualRect.right + PADDING;
      break;
    case 'left':
      loopBoundary = elementVirtualRect.left - PADDING;
      break;
  }

  if (loopSide === 'top' || loopSide === 'bottom') {
    loopBoundary -= parentCoordinates.y;
  } else {
    loopBoundary -= parentCoordinates.x;
  }

  return { loopSide, loopBoundary };
}

/**
 * [REFACTORED for Clarity and Priority] The "Strategizer" for inter-container routing.
 *
 * This function uses a clear, prioritized "checklist" pattern to determine
 * the correct routing strategy. It checks for the most specific or restrictive
 * conditions first, making the logic easy to follow and debug.
 *
 * The priority is as follows:
 * 1.  Any connection involving a 'top' or 'bottom' anchor is a BOX. (Highest Priority)
 * 2.  An opposing 'left'/'right' connection is a BOX.
 * 3.  An aligned same-side 'left'/'right' connection is an ELBOW.
 * 4.  A misaligned same-side 'left'/'right' connection is a U_TURN. (Lowest Priority)
 */
export function determineInterContainerRoutingStrategyUsed(
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
  sourcePoint: IPoint,
  endPoint: IPoint,
):
  | InterContainerElbowInstruction['type']
  | InterContainerUTurnInstruction['type']
  | InterContainerPathInstruction['type'] {
  // --- Define explicit conditions for clarity ---
  const involvesVerticalAnchor =
    sourceAnchor === 'top' ||
    sourceAnchor === 'bottom' ||
    targetAnchor === 'top' ||
    targetAnchor === 'bottom';

  const isOpposingHorizontal =
    (sourceAnchor === 'right' && targetAnchor === 'left') ||
    (sourceAnchor === 'left' && targetAnchor === 'right');

  const isSameSideHorizontal =
    (sourceAnchor === 'right' && targetAnchor === 'right') ||
    (sourceAnchor === 'left' && targetAnchor === 'left');

  // --- The Prioritized Checklist ---

  // Priority 1: Any connection involving vertical anchors MUST use the box path for safety.
  if (involvesVerticalAnchor) {
    return 'INTER_CONTAINER_BOX';
  }

  // Priority 2: An opposing horizontal connection is obstructed and MUST use the box path.
  if (isOpposingHorizontal) {
    return 'INTER_CONTAINER_BOX';
  }

  // Priority 3 & 4: Handle the remaining same-side horizontal cases.
  if (isSameSideHorizontal) {
    const isAligned = Math.abs(sourcePoint.x - endPoint.x) < 1;
    if (isAligned) {
      // TODO: CONTINUE HERE
      // Seems we really not require an elbow type
      return 'INTER_CONTAINER_ELBOW';
      // return 'INTER_CONTAINER_U_TURN';
    } else {
      return 'INTER_CONTAINER_U_TURN';
    }
  }

  // This is a fallback that should ideally not be reached if all cases are covered.
  console.warn(
    '-> Heuristic Fallback: No specific condition met. Defaulting to BOX.',
  );
  return 'INTER_CONTAINER_BOX';
}

/*------------------------------------------------------------------------------
  Constants shared with the renderer
------------------------------------------------------------------------------*/
// const TURN_OUT_DISTANCE = 6; // how far we step out of a node before turning
// const ARROW_HEAD_INSET = 6; // how far the arrow‑head retracts into the node
// const ALIGN_TOLERANCE = 1; // ≤ 1 px counts as “same line”

// const ARROW_HEAD_INSET = -5.5; // how far the arrow‑head retracts into the node
const ARROW_HEAD_INSET = -6; // how far the arrow‑head retracts into the node
const ALIGN_TOLERANCE = 0.5; // ≤ 1 px counts as “same line”

/*------------------------------------------------------------------------------
  Constants – keep in sync with renderer
------------------------------------------------------------------------------*/
// const TURN_OUT_DISTANCE = 6; // step‑out distance for the source
// const ARROW_HEAD_INSET = 6; // arrow‑head length (retracted into the target)
// const ALIGN_TOLERANCE = 1; // ≤1 px counts as “aligned”

/*------------------------------------------------------------------------------
  Helpers
------------------------------------------------------------------------------*/
function anchorVector(anchor: TAnchorPosition): { dx: number; dy: number } {
  switch (anchor) {
    case 'left':
      return { dx: -1, dy: 0 };
    case 'right':
      return { dx: 1, dy: 0 };
    case 'top':
      return { dx: 0, dy: -1 };
    case 'bottom':
      return { dx: 0, dy: 1 };
  }
}

/** First visible straight segment: source = +TURN_OUT, target = −ARROW_INSET */
export function routingRefPoint(
  anchor: TAnchorPosition,
  p: IPoint,
  kind: 'source' | 'target',
): IPoint {
  const { dx, dy } = anchorVector(anchor);
  const offset = kind === 'source' ? TURN_OUT_DISTANCE : -ARROW_HEAD_INSET;
  return { x: p.x + dx * offset, y: p.y + dy * offset };
}

/*-----------------------------------------------------------------------------
  The Strategizer
-----------------------------------------------------------------------------*/
export function determineInterContainerRoutingStrategy(
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
  sourcePoint: IPoint,
  targetPoint: IPoint,
):
  | InterContainerElbowInstruction['type']
  | InterContainerUTurnInstruction['type']
  | InterContainerPathInstruction['type'] {
  /* ── 1. Compute the routing points we’ll compare ────────────────────────── */
  const start = routingRefPoint(sourceAnchor, sourcePoint, 'source');
  const end = routingRefPoint(targetAnchor, targetPoint, 'target');

  // const start = sourcePoint;
  // const end = targetPoint;

  const Δx = Math.abs(start.x - end.x);
  const Δy = Math.abs(start.y - end.y);

  /* ── 2. Begin trace group ──────────────────────────────────────────────── */

  /* ── 3. Classify anchor relationship ───────────────────────────────────── */
  const sameH =
    (sourceAnchor === 'left' && targetAnchor === 'left') ||
    (sourceAnchor === 'right' && targetAnchor === 'right');

  const oppH =
    (sourceAnchor === 'left' && targetAnchor === 'right') ||
    (sourceAnchor === 'right' && targetAnchor === 'left');

  const sameV =
    (sourceAnchor === 'top' && targetAnchor === 'top') ||
    (sourceAnchor === 'bottom' && targetAnchor === 'bottom');

  const oppV =
    (sourceAnchor === 'top' && targetAnchor === 'bottom') ||
    (sourceAnchor === 'bottom' && targetAnchor === 'top');

  let decision:
    | InterContainerElbowInstruction['type']
    | InterContainerUTurnInstruction['type']
    | InterContainerPathInstruction['type'];

  /* ── 4. Decision tree ──────────────────────────────────────────────────── */
  if (oppH || oppV) {
    decision = 'INTER_CONTAINER_BOX';
  } else if (sameH) {
    // horizontal anchors → check Δx
    decision =
      Δx < ALIGN_TOLERANCE ? 'INTER_CONTAINER_ELBOW' : 'INTER_CONTAINER_U_TURN';
  } else if (sameV) {
    // vertical anchors → check Δy
    decision =
      Δy < ALIGN_TOLERANCE ? 'INTER_CONTAINER_ELBOW' : 'INTER_CONTAINER_U_TURN';
  } else {
    decision = 'INTER_CONTAINER_BOX'; // mixed orientation fallback
  }

  return decision;
}
