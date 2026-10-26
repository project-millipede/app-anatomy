import type { RefObject } from 'react';
import type {
  IPoint,
  TAnchorPosition,
  RoutingInstruction,
  ObstructedUturnInstruction,
} from '../types';

import { Point } from './Point';
import { computeAnchorAxisVector } from './vector';
import { isSameAxis } from '../hooks/utils';
import { routingRefPoint } from '../hooks/inter-instance';

/**
 * A utility function that converts a `DOMRect` object into a `Point` object,
 * using the rectangle's top-left corner (`left`, `top`) as the point's
 * coordinates.
 *
 * @param rect The `DOMRect` object to convert.
 * @returns A new `Point` instance representing the top-left origin of the rectangle.
 */
const rectToPoint = (rect: DOMRect): Point => {
  return new Point(rect.left, rect.top);
};

/**
 * Calculates the absolute screen coordinates for a specified logical anchor
 * position on a given `DOMRect`.
 *
 * This function translates a logical name (e.g., 'top', 'right') into a
 * concrete geometric point. The resulting coordinates are absolute, relative
 * to the viewport's top-left corner.
 *
 * For example, for the 'top' anchor, it calculates the point at the horizontal
 * center of the rectangle's top edge.
 *
 * @param anchorPosition The logical side of the rectangle ('top', 'bottom',
 *                       'left', 'right', or 'middle') for which to compute coordinates.
 * @param rect The `DOMRect` representing the element's position and dimensions.
 * @returns A new `Point` instance with the absolute screen coordinates of the anchor.
 */
const computeCoordinatesFromAnchorPosition = (
  anchorPosition: TAnchorPosition,
  rect: DOMRect,
): Point => {
  switch (anchorPosition) {
    case 'top':
      // The top-center point of the rectangle.
      return rectToPoint(rect).add(new Point(rect.width / 2, 0));

    case 'bottom':
      // The bottom-center point of the rectangle.
      return rectToPoint(rect).add(new Point(rect.width / 2, rect.height));

    case 'left':
      // The left-center point of the rectangle.
      return rectToPoint(rect).add(new Point(0, rect.height / 2));

    case 'right':
      // The right-center point of the rectangle.
      return rectToPoint(rect).add(new Point(rect.width, rect.height / 2));

    default:
      // Fallback for any unknown anchor position.
      return new Point(0, 0);
  }
};

/**
 * Gets the origin coordinates (top-left corner) of a given DOM element.
 *
 * This utility's primary purpose is to get the `getBoundingClientRect` for an
 * element and convert its origin into a `Point` object for calculations.
 *
 * @param element The DOM element whose origin coordinates are needed.
 * @returns A `Point` object representing the element's top-left corner in
 *          absolute screen coordinates, or a zero-point if the element is null.
 */
export const getElementOrigin = (element: Element | null): Point => {
  // A valid DOM element is required to perform the calculation.
  if (element) {
    const rect = element.getBoundingClientRect();
    return rectToPoint(rect);
  }
  // If the element is null, return a default zero-point to prevent errors.
  return new Point(0, 0);
};

// Not in use anymore
export const getParentCoordinates = (ref: any): Point => {
  if (ref && ref.current) {
    const rect = ref.current.getBoundingClientRect();
    return rectToPoint(rect);
  }
  return new Point(0, 0);
};

/** Type definition for SVG marker units attribute */
type MarkerUnits = 'strokeWidth' | 'userSpaceOnUse';

/**
 * Calculates the required end-point (P) for an SVG line so that the `tip` of an
 * attached marker lands exactly on the desired `anchor` coordinates.
 *
 * Essential for correctly positioning lines/paths when using SVG markers.
 *
 * --- Key Aspects ---
 *
 * 1.  Goal: Determine the coordinate `P` where a path should end so its
 *     attached marker's tip aligns precisely with the `anchor` point.
 *
 * 2.  Marker Assumption: Assumes a standard marker setup where the attachment
 *     point corresponds to `refX=0` and the visual tip is `arrowLength` units
 *     away along the marker's positive X-axis.
 *
 * 3.  Scaling (`markerUnits`): The core calculation depends on how the marker
 *     scales:
 *     - If `markerUnits` is `'strokeWidth'`, the offset distance is scaled by
 *       the line's `strokeWidth`: `offset = arrowLength * strokeWidth`.
 *     - If `markerUnits` is `'userSpaceOnUse'`, the offset distance is absolute
 *       in pixels: `offset = arrowLength`.
 *
 * 4.  Direction: The `anchorPosition` determines the direction vector from the
 *     `anchor` (Tip) towards the calculated end-point `P`. See
 *     `computeAnchorAxisVector`.
 *
 * 5.  Formula: `P = anchor + directionVector(Tip -> P) * calculatedOffset`
 *
 * --- Example Usage ---
 * ```typescript
 * const tipTarget = { x: 100, y: 50 };
 * const markerLength = 10; // Units inside marker definition
 * const lineWidth = 3;
 * const targetSide = 'right'; // Tip should be at the right anchor
 *
 * // If the SVG <marker> has markerUnits="strokeWidth"
 * const endPoint1 = calculateLineEndPointForMarkerTip(
 *   tipTarget, markerLength, lineWidth, targetSide, 'strokeWidth'
 * ); // offset = 10 * 3 = 30; P = { x: 130, y: 50 }
 *
 * // If the SVG <marker> has markerUnits="userSpaceOnUse" (or is default)
 * const endPoint2 = calculateLineEndPointForMarkerTip(
 *   tipTarget, markerLength, lineWidth, targetSide, 'userSpaceOnUse'
 * ); // offset = 10; P = { x: 110, y: 50 }
 *
 * // Draw path ending at endPoint1 or endPoint2 respectively.
 * ```
 *
 * @param anchor         The user-space coordinates (x, y) where the marker
 *                       `tip` must land.
 * @param arrowLength    The length/offset of the marker's tip from its
 *                       attachment point (`refX=0`) in the marker's own
 *                       coordinate system (before scaling).
 * @param strokeWidth    The `stroke-width` of the line/path. Only used if
 *                       `markerUnits` is 'strokeWidth'.
 * @param anchorPosition Specifies the logical side ('left', 'right', 'top',
 *                       'bottom') of the target element where the `anchor`
 *                       point lies. Determines offset direction.
 * @param markerUnits    Specifies how the `arrowLength` translates to pixel
 *                       offset. Defaults to 'strokeWidth'. Set to
 *                       'userSpaceOnUse' if your marker uses that.
 *
 * @returns An `IPoint` object containing the (x, y) coordinates for the
 *          line/path end vertex (P).
 */
export function calculateLineEndPointForMarkerTip(
  anchor: IPoint,
  arrowLength: number,
  strokeWidth: number, // Keep required, but only used conditionally
  anchorPosition: TAnchorPosition,
  markerUnits: MarkerUnits = 'strokeWidth', // Default to strokeWidth scaling
): IPoint {
  // 1. Determine the direction vector from Tip (anchor) to P (line end-point)
  //    This vector indicates the axis along which the offset should be applied.
  //    e.g., { x: +1 | -1 | 0, y: +1 | -1 | 0 }
  const directionTipToP = computeAnchorAxisVector(anchorPosition);

  // 2. Calculate the scalar offset distance in pixels based on markerUnits
  //    This offset is needed because the marker's tip position is relative to
  //    its own coordinate system origin (refX=0), which aligns with the path
  //    end (P), not necessarily the desired visual 'anchor' point.
  const tipOffsetPixels =
    markerUnits === 'strokeWidth'
      ? arrowLength * strokeWidth // Scale by strokeWidth
      : arrowLength; // Use absolute length

  // 3. Calculate the offset vector components (Tip -> P vector)
  //    Multiply the scalar distance by the direction vector components.
  const offsetX = directionTipToP.x * tipOffsetPixels;
  const offsetY = directionTipToP.y * tipOffsetPixels;

  // 4. Calculate the final line end-point P by adding the offset vector to the
  //    anchor point (Tip)
  //    P = Tip + offsetVector(Tip -> P)
  const endPointX = anchor.x + offsetX;
  const endPointY = anchor.y + offsetY;

  return {
    x: endPointX,
    y: endPointY,
  };
}

// not in use anymore
export const getCoordinatesFromAnchorPosition = (
  position: TAnchorPosition,
  parentCoordinates: Point,
  ref: RefObject<Element | null> | null,
) => {
  if (ref && ref.current) {
    const rect = ref.current.getBoundingClientRect();
    const absolutePosition = computeCoordinatesFromAnchorPosition(
      position,
      rect,
    );
    return absolutePosition.substract(parentCoordinates);
  }
  return new Point(0, 0);
};

/**
 * Calculates the coordinates of a logical anchor position on a given DOM element
 * and returns them relative to a parent's coordinate space.
 *
 * The calculation involves two main transformations:
 * 1.  Finds the absolute screen coordinates of the anchor on the element
 *     using its `getBoundingClientRect()`.
 * 2.  Transforms these absolute coordinates into a relative coordinate system
 *     by subtracting the parent's origin point. This is essential for correctly
 *     positioning elements within an SVG canvas or other offset parent.
 *
 * @param position The logical anchor side ('top', 'bottom', 'left', 'right').
 * @param parentCoordinates The origin point (top-left corner) of the parent
 *        coordinate space, to which the result will be relative.
 * @param element The DOM element on which the anchor lies.
 * @returns A `Point` object with the calculated (x, y) coordinates relative to
 *          the parent, or a zero-point if the element is null.
 */
export const getRelativeAnchorCoordinates = (
  position: TAnchorPosition,
  parentCoordinates: Point,
  element: Element | null,
): Point => {
  // A valid DOM element is required to perform any calculation.
  if (element) {
    /**
     * 1. Get the element's absolute position and dimensions on the screen.
     *    The `getBoundingClientRect()` method returns coordinates relative to
     *    the viewport's top-left corner, which serves as the global coordinate
     *    system.
     */
    const rect = element.getBoundingClientRect();

    /**
     * 2. Calculate the anchor's absolute position in the global system.
     *    This logic is delegated to a pure helper that computes a point on the
     *    rectangle (e.g., the middle of the top edge).
     */
    const absolutePosition = computeCoordinatesFromAnchorPosition(
      position,
      rect,
    );

    /**
     * 3. Transform the absolute anchor position into a relative one.
     *    To draw inside a container (like an SVG), the coordinates must be
     *    relative to that container's origin. Subtracting the parent's origin
     *    point from the anchor's absolute point achieves this transformation.
     */
    return absolutePosition.substract(parentCoordinates);
  }

  /**
   * If the element is null (e.g., not yet rendered), a position cannot be
   * calculated. Returning a default zero-point prevents downstream errors.
   */
  return new Point(0, 0);
};

/**
 * The distance a "U-turn" path should extend away from the elements
 * when connecting two anchors on the same side.
 */
const TURN_OUT_DISTANCE = 5.5;

/**
 * For a same-side connection, calculates the coordinate for the "turn-out"
 * segment of the path.
 *
 * @param start - The start point of the arrow.
 * @param end - The end point of the arrow.
 * @param side - The common side ('top', 'bottom', 'left', 'right') for the connection.
 * @returns The numerical value for the bend coordinate (either an x or y value).
 */
function calculateSameSideTurnOutCoordinate(
  start: IPoint,
  end: IPoint,
  side: TAnchorPosition,
): number {
  switch (side) {
    case 'bottom':
      return Math.max(start.y, end.y) + TURN_OUT_DISTANCE;
    case 'top':
      return Math.min(start.y, end.y) - TURN_OUT_DISTANCE;
    case 'right':
      return Math.max(start.x, end.x) + TURN_OUT_DISTANCE;
    case 'left':
      return Math.min(start.x, end.x) - TURN_OUT_DISTANCE;
    default:
      return 0;
  }
}

/**
 * A discriminated union that holds the pre-calculated geometric guide values
 * for routing a path between two points.
 */
type PathGuides =
  | {
      connectionType: 'same-side';
      turnOutCoordinate: number;
    }
  | {
      connectionType: 'mixed-side';
      horizontalMidpoint: number;
      verticalMidpoint: number;
    };

/**
 * Analyzes the connection between two anchors and computes the fundamental
 * geometric guide values needed for routing a path. This is the common
 * core logic shared by both curved and orthogonal path strategies.
 */
export function analyzePathConnection(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
): PathGuides {
  if (startAnchor === endAnchor) {
    return {
      connectionType: 'same-side',
      turnOutCoordinate: calculateSameSideTurnOutCoordinate(
        start,
        end,
        startAnchor,
      ),
    };
  } else {
    return {
      connectionType: 'mixed-side',
      horizontalMidpoint: (start.x + end.x) / 2,
      verticalMidpoint: (start.y + end.y) / 2,
    };
  }
}

/**
 * Calculates the two intermediate waypoints for a same-side "U-turn" path.
 *
 * This function is used when an arrow connects two anchors on the same side of
 * their respective elements (e.g., 'bottom' to 'bottom'). It generates two
 * waypoints that create a path that first "turns out" away from the elements,
 * travels parallel to them, and then "turns back in".
 *
 * The logic is geometrically identical for both curved paths (where these points
 * act as control points) and orthogonal paths (where they act as corners).
 *
 * @param side - The common side of the connection ('top', 'bottom', 'left', 'right').
 * @param turnOutCoordinate - The pre-calculated coordinate for the main "outward"
 *   segment of the path. This will be a Y-coordinate for top/bottom connections,
 *   and an X-coordinate for left/right connections.
 * @param start - The starting point of the arrow.
 * @param end - The ending point of the arrow.
 * @returns A tuple `[waypoint1, waypoint2]` containing the two calculated points.
 */
function calculateSameSideWaypoints(
  side: TAnchorPosition,
  turnOutCoordinate: number,
  start: IPoint,
  end: IPoint,
): [IPoint, IPoint] {
  // A connection on the 'left' or 'right' side forms a horizontal U-turn,
  // meaning its main traverse segment is vertical.
  const isHorizontalTurn = side === 'left' || side === 'right';

  if (isHorizontalTurn) {
    // Case 1: Horizontal U-turn for 'left' or 'right' connections.
    // The path must travel along a shared VERTICAL line. To achieve this,
    // both waypoints must have the same X-coordinate.
    return [
      { x: turnOutCoordinate, y: start.y },
      { x: turnOutCoordinate, y: end.y },
    ];
  } else {
    // Case 2: Vertical U-turn for 'top' or 'bottom' connections.
    // The path must travel along a shared HORIZONTAL line. To achieve this,
    // both waypoints must have the same Y-coordinate.
    return [
      { x: start.x, y: turnOutCoordinate },
      { x: end.x, y: turnOutCoordinate },
    ];
  }
}

/**
 * Calculates the two control points for a mixed-side S-CURVE.
 * The path is defined by two independent turns.
 */
function calculateMixedSideSCurvePoints(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  guides: { horizontalMidpoint: number; verticalMidpoint: number },
): [IPoint, IPoint] {
  const { horizontalMidpoint, verticalMidpoint } = guides;
  /*
   * ALGORITHMIC DIFFERENCE: S-CURVE
   * This algorithm makes TWO INDEPENDENT DECISIONS to create a smooth S-shape.
   *
   * 1. The first control point's position is decided ONLY by the source anchor's
   *    orientation.
   * 2. The second control point's position is decided SEPARATELY, based ONLY
   *    on the target anchor's orientation.
   */

  // --- Source Control Point ---
  const sourceLeavesHorizontally =
    startAnchor === 'left' || startAnchor === 'right';
  const sourceControlPoint = sourceLeavesHorizontally
    ? { x: horizontalMidpoint, y: start.y }
    : { x: start.x, y: verticalMidpoint };

  // --- Target Control Point ---
  const targetArrivesHorizontally =
    endAnchor === 'left' || endAnchor === 'right';
  const targetControlPoint = targetArrivesHorizontally
    ? { x: horizontalMidpoint, y: end.y }
    : { x: end.x, y: verticalMidpoint };

  return [sourceControlPoint, targetControlPoint];
}

/**
 * Calculates the two corner points for a mixed-side ORTHOGONAL ELBOW.
 *
 *  ─ Design Goals ──────────────────────────────────────────────────────────
 *  • First segment follows the source anchor’s axis
 *  • Last  segment follows the   target anchor’s axis _from the outside_
 *    – horizontal for left│right anchors
 *    – vertical   for top │bottom anchors
 *  • Exactly two corners are returned so the caller can build
 *      start ──► corner1 ──► corner2 ──► end
 */
/**
 * Mixed-axis elbow that produces the minimum **three** corners required to
 * keep segment 1 aligned with the source side and segment N aligned with the
 * target side – no matter which combination of sides you pick.
 *
 *   • sourceCorner1  (C1)  – one grid step “outside” the source
 *   • middleCorner   (C2)  – the turn onto the long transversal
 *   • targetCorner   (C3)  – one grid step “outside” the target
 *
 * For same-axis connections we still return the classic two-corner U-turn,
 * keeping everything backward-compatible.
 */

/**
 * Orthogonal elbow waypoint generator.
 * Returns [firstCorner, lastCorner].
 * For mixed-axis links it also attaches a hidden middle corner as
 * (result as any)._middle so buildPolylinePath can insert it.
 */
function calculateMixedSideElbowPoints(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  // guides: {
  //   horizontalMidpoint: number;
  //   verticalMidpoint: number;
  //   turnOutCoordinate: number;
  // }
  guides: Extract<PathGuides, { connectionType: 'mixed-side' }>,
): [IPoint, IPoint] {
  const OUT = TURN_OUT_DISTANCE;
  const isHoriz = (a: TAnchorPosition) => a === 'left' || a === 'right';
  const isVert = (a: TAnchorPosition) => a === 'top' || a === 'bottom';

  /* ─────────────────────────── ① SAME SIDE ─────────────────────────── */
  // if (startAnchor === endAnchor) {
  //   return calculateSameSideWaypoints(
  //     startAnchor,
  //     guides.turnOutCoordinate,
  //     start,
  //     end
  //   ); // classic two-corner U-turn
  // }

  /* ─────────────────────── ② SAME AXIS, DIFF SIDE ───────────────────── */
  if (
    (isHoriz(startAnchor) && isHoriz(endAnchor)) ||
    (isVert(startAnchor) && isVert(endAnchor))
  ) {
    // share the perpendicular midpoint axis (old behaviour)
    if (isHoriz(startAnchor)) {
      // left ↔ right
      const x = guides.horizontalMidpoint;
      return [
        { x, y: start.y },
        { x, y: end.y },
      ];
    } // top ↔ bottom
    const y = guides.verticalMidpoint;
    return [
      { x: start.x, y },
      { x: end.x, y },
    ];
  }

  /* ───────────────────────── ③ MIXED AXIS ──────────────────────────── */
  // first corner A – one OUT step away from the source
  const A =
    startAnchor === 'left'
      ? { x: start.x - OUT, y: start.y }
      : startAnchor === 'right'
        ? { x: start.x + OUT, y: start.y }
        : startAnchor === 'top'
          ? { x: start.x, y: start.y - OUT }
          : /* bottom */ { x: start.x, y: start.y + OUT };

  // last corner B – one OUT step away from the target
  const B =
    endAnchor === 'left'
      ? { x: end.x - OUT, y: end.y }
      : endAnchor === 'right'
        ? { x: end.x + OUT, y: end.y }
        : endAnchor === 'top'
          ? { x: end.x, y: end.y - OUT }
          : /* bottom */ { x: end.x, y: end.y + OUT };

  // hidden middle corner M keeps the elbow orthogonal
  const M = isHoriz(startAnchor)
    ? { x: A.x, y: B.y } // A→M vertical, M→B horizontal
    : { x: B.x, y: A.y }; // A→M horizontal, M→B vertical

  const result: [IPoint, IPoint] = [A, B];
  (result as any)._middle = M; // expose to the builder
  return result;
}

// ========================================================================
// Waypoint Calculation Logic
// (These functions determine the intermediate points for each path style)
// ========================================================================

/**
 * Computes the two off-path control points needed to draw a smooth S-CURVE.
 */
function computeCurveControlPoints(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
): [IPoint, IPoint] {
  const guides = analyzePathConnection(start, end, startAnchor, endAnchor);

  if (guides.connectionType === 'same-side') {
    // For same-side connections, a U-turn is optimal for both curves and lines.
    return calculateSameSideWaypoints(
      startAnchor,
      guides.turnOutCoordinate,
      start,
      end,
    );
  } else {
    // THIS IS THE DIVERGENCE: We call the helper for an S-CURVE.
    return calculateMixedSideSCurvePoints(
      start,
      end,
      startAnchor,
      endAnchor,
      guides,
    );
  }
}

const LOOP_PADDING = TURN_OUT_DISTANCE;
const PADDING = TURN_OUT_DISTANCE;
/**
 * Builds the four corner points for a self-referencing arrow on the same axis.
 * It uses a pre-calculated boundary coordinate to create a path that loops
 * around the element at a precise distance.
 *
 * This function is called only when a `loopInstruction` is provided, indicating
 * a special self-loop path is required.
 *
 * @param start - The starting point of the arrow (e.g., at the 'left' anchor).
 * @param end - The ending point of the arrow (e.g., at the 'right' anchor).
 * @param startAnchor - The anchor position where the arrow originates.
 * @param loopInstruction - An object containing the axis ('x' or 'y') and the
 *                          pre-calculated coordinate of the element's boundary
 *                          to loop around.
 * @returns An array of four `IPoint` objects representing the corners of the
 *          rectangular loop path.
 */
export function buildAnchorRelativeSelfLoopCorners(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition, // We need the endAnchor to calculate the last corner correctly
  loopInstruction: { type: 'x' | 'y'; value: number },
): IPoint[] {
  // const PADDING = 12; // Or your chosen value

  // --- Case 1: Horizontal connection (left <-> right) ---
  if (loopInstruction.type === 'y') {
    const yLoop = loopInstruction.value; // The pre-calculated boundary + padding

    // c1: Go "out" from the START anchor, respecting its side.
    const c1_x_offset = startAnchor === 'left' ? -PADDING : PADDING;
    const c1 = { x: start.x + c1_x_offset, y: start.y };

    // c2: Turn up/down to the looping lane.
    const c2 = { x: c1.x, y: yLoop };

    // c3: Move across to align with the END anchor.
    // THIS IS THE FIX: The offset for the final turn must be based on the END anchor's side.
    const c3_x_offset = endAnchor === 'left' ? -PADDING : PADDING;
    const c3 = { x: end.x + c3_x_offset, y: yLoop };

    // c4: Turn back towards the end anchor.
    const c4 = { x: c3.x, y: end.y };

    return [c1, c2, c3, c4];
  }

  // --- Case 2: Vertical connection (top <-> bottom) ---
  else {
    const xLoop = loopInstruction.value; // The pre-calculated boundary + padding

    // c1: Go "out" from the START anchor.
    const c1_y_offset = startAnchor === 'top' ? -PADDING : PADDING;
    const c1 = { x: start.x, y: start.y + c1_y_offset };

    // c2: Turn left/right to the looping lane.
    const c2 = { x: xLoop, y: c1.y };

    // c3: Move across to align with the END anchor.
    // APPLYING THE SAME FIX HERE for symmetry.
    const c3_y_offset = endAnchor === 'top' ? -PADDING : PADDING;
    const c3 = { x: xLoop, y: end.y + c3_y_offset };

    // c4: Turn back towards the end anchor.
    const c4 = { x: end.x, y: c3.y };

    return [c1, c2, c3, c4];
  }
}

function buildHorizontalSelfLoopCorners(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  yLoop: number,
): IPoint[] {
  const c1_x_offset = startAnchor === 'left' ? -LOOP_PADDING : PADDING;
  const c1: IPoint = { x: start.x + c1_x_offset, y: start.y };

  const c2: IPoint = { x: c1.x, y: yLoop };

  const c3_x_offset = endAnchor === 'left' ? -LOOP_PADDING : PADDING;
  const c3: IPoint = { x: end.x + c3_x_offset, y: yLoop };

  const c4: IPoint = { x: c3.x, y: end.y };

  return [c1, c2, c3, c4];
}

function buildVerticalSelfLoopCorners(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  xLoop: number,
): IPoint[] {
  const c1_y_offset = startAnchor === 'top' ? -LOOP_PADDING : PADDING;
  const c1: IPoint = { x: start.x, y: start.y + c1_y_offset };

  const c2: IPoint = { x: xLoop, y: c1.y };

  const c3_y_offset = endAnchor === 'top' ? -LOOP_PADDING : PADDING;
  const c3: IPoint = { x: xLoop, y: end.y + c3_y_offset };

  const c4: IPoint = { x: end.x, y: c3.y };

  return [c1, c2, c3, c4];
}

function buildDefaultCorners(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
): IPoint[] {
  // NOTE: This requires `analyzePathConnection`, `calculateSameSideWaypoints`,
  // and `calculateMixedSideElbowPoints` to be present in this file.
  const guides = analyzePathConnection(start, end, startAnchor, endAnchor);

  if (guides.connectionType === 'same-side') {
    return calculateSameSideWaypoints(
      startAnchor,
      guides.turnOutCoordinate,
      start,
      end,
    );
  }

  // if (guides.connectionType === 'same-side') {
  //   return calculateSameSideWaypoints(
  //     startAnchor,
  //     guides.turnOutCoordinate,
  //     start,
  //     end
  //   );
  // } else {
  //   return calculateMixedSideElbowPoints(
  //     start,
  //     end,
  //     startAnchor,
  //     endAnchor,
  //     guides
  //   );
  // }

  return calculateMixedSideElbowPoints(
    start,
    end,
    startAnchor,
    endAnchor,
    guides,
  );
}

/**
 * Builds the four corner points for a local, relative U-turn path
 * that avoids crossing over the source or target elements.
 * This function correctly models the red path you drew.
 *
 * @returns An array of four IPoint objects representing the path's corners.
 */
function buildLocalRelativeUturnCorners(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
): IPoint[] {
  // const PADDING = 25; // The distance to "turn out" from the element.

  // The logic must be based on the ANCHOR a-axis, not the geometric axis.
  const isLogicallyHorizontal =
    startAnchor === 'left' || startAnchor === 'right';

  let c1: IPoint, c2: IPoint, c3: IPoint, c4: IPoint;

  if (isLogicallyHorizontal) {
    // --- Logically Horizontal Case (e.g., right-to-left) ---
    // The path will primarily travel up/down to make the U-turn.

    // 1. Calculate the outward X positions for the start and end points.
    const startOutwardX =
      startAnchor === 'left' ? start.x - PADDING : start.x + PADDING;

    const endOutwardX =
      endAnchor === 'left' ? end.x - PADDING : end.x + PADDING;

    // 2. The Y coordinate for the horizontal travel segment. We can place
    //    it at the midpoint between the two elements.
    const midY = (start.y + end.y) / 2;

    // 3. Define the four corners of the rectangular path.
    //    c1 is the point after leaving the source and making the first 90-degree turn.
    //    c2 is the point where the path turns to travel horizontally.
    //    c3 is the point where the path aligns with the target's outward path.
    //    c4 is the point just before the final 90-degree turn into the target.
    c1 = { x: startOutwardX, y: start.y };
    c2 = { x: startOutwardX, y: midY };
    c3 = { x: endOutwardX, y: midY };
    c4 = { x: endOutwardX, y: end.y };

    return [c1, c2, c3, c4];
  } else {
    // --- Logically Vertical Case (e.g., top-to-bottom) ---
    // The path will primarily travel left/right to make the U-turn.

    // 1. Calculate the outward Y positions.
    const startOutwardY =
      startAnchor === 'top' ? start.y - PADDING : start.y + PADDING;

    const endOutwardY = endAnchor === 'top' ? end.y - PADDING : end.y + PADDING;

    // 2. The X coordinate for the vertical travel segment.
    const midX = (start.x + end.x) / 2;

    // 3. Define the four corners.
    c1 = { x: start.x, y: startOutwardY };
    c2 = { x: midX, y: startOutwardY };
    c3 = { x: midX, y: endOutwardY };
    c4 = { x: end.y, y: endOutwardY }; // Typo fixed: should be end.x

    c4 = { x: end.x, y: endOutwardY };

    return [c1, c2, c3, c4];
  }
}

// Assuming IPoint, TAnchorPosition, and PADDING are defined elsewhere.
// const PADDING = 25;

/**
 * Builds the 3 corner points required to draw a 4-legged elbow-shaped path.
 *
 * This function is designed specifically for the 'LOCAL_RELATIVE_BOX' instruction,
 * which is triggered for mixed-axis connections (e.g., 'top' to 'left') where
 * a standard U-turn is not applicable.
 *
 * The path is constructed as a simple, right-angled elbow with an initial
 * "outward" segment from both the source and target.
 *
 * @param start The coordinates of the starting point.
 * @param end The coordinates of the ending point.
 * @param startAnchor The logical anchor position of the start.
 * @param endAnchor The logical anchor position of the end.
 * @returns An array of 3 corner points that define the 4-legged path.
 */
function buildLocalElbowCorners(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
): IPoint[] {
  // This function assumes it's only called for mixed-axis connections.
  // We first determine if the starting anchor is on the horizontal axis.
  const isStartHorizontal = startAnchor === 'left' || startAnchor === 'right';

  let c1: IPoint, c2: IPoint, c3: IPoint;

  if (isStartHorizontal) {
    // --- Case 1: Start is Horizontal, End is Vertical ---
    // Example: 'left' -> 'top' or 'right' -> 'bottom'

    // 1. Calculate the outward positions based on the anchors.
    const startOutwardX =
      startAnchor === 'left' ? start.x - PADDING : start.x + PADDING;
    const endOutwardY = endAnchor === 'top' ? end.y - PADDING : end.y + PADDING;

    // 2. Define the three corners for the elbow path.
    // c1 is the first turn, moving outward from the source.
    c1 = { x: startOutwardX, y: start.y };

    // c2 is the main "elbow" corner. It takes its X from the first leg
    // and its Y from the third leg, forming a right angle.
    c2 = { x: startOutwardX, y: endOutwardY };

    // c3 is the final turn before approaching the target.
    c3 = { x: end.x, y: endOutwardY };

    return [c1, c2, c3];
  } else {
    // --- Case 2: Start is Vertical, End is Horizontal ---
    // Example: 'top' -> 'left' or 'bottom' -> 'right'

    // 1. Calculate the outward positions based on the anchors.
    const startOutwardY =
      startAnchor === 'top' ? start.y - PADDING : start.y + PADDING;
    const endOutwardX =
      endAnchor === 'left' ? end.x - PADDING : end.x + PADDING;

    // 2. Define the three corners.
    // c1 is the first turn, moving outward from the source.
    c1 = { x: start.x, y: startOutwardY };

    // c2 is the main "elbow" corner. It takes its Y from the first leg
    // and its X from the third leg.
    c2 = { x: endOutwardX, y: startOutwardY };

    // c3 is the final turn before approaching the target.
    c3 = { x: endOutwardX, y: end.y };

    return [c1, c2, c3];
  }
}

/**
 * Builds the corner points for all "obstructed U-turn" cases.
 * It chooses between a simple 2-point C-shape for the normal case,
 * and a robust 4-point box-shape for the "flat line" case.
 *
 * @param start - The starting point of the arrow.
 * @param end - The ending point of the arrow.
 * @param instruction - The specific instruction object containing the path type and boundary.
 * @returns An array of IPoint objects representing the path's corners.
 */

/**
 * [CORRECTED VERSION]
 * Builds the corner points for all "obstructed" path cases, now with added
 * intelligence for mixed-axis connections.
 */
function buildObstructedUturnCorners(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  instruction: ObstructedUturnInstruction,
): IPoint[] {
  // --- NEW: Handle Mixed-Axis Connections First ---
  // A mixed-axis connection (like the green 'right'-to-'bottom' arrow)
  // always requires a standard elbow path, regardless of the instruction type.
  if (!isSameAxis(startAnchor, endAnchor)) {
    // The `buildDefaultCorners` function already knows how to create the
    // correct 3-corner/4-leg elbow path for mixed-axis cases.
    return buildDefaultCorners(start, end, startAnchor, endAnchor);
  }

  // --- If we are here, we are guaranteed to have a SAME-AXIS connection ---
  // The existing logic for handling U-turns is correct for these cases.
  switch (instruction.type) {
    case 'OBSTRUCTED_U_TURN': {
      const { connectionSide } = instruction;
      return buildDefaultCorners(start, end, connectionSide, connectionSide);
    }
    case 'OBSTRUCTED_U_TURN_BOX': {
      // ... (this part of your existing code is correct) ...

      const { loopSide, loopBoundary } = instruction;

      if (loopSide === 'top' || loopSide === 'bottom') {
        const yLoop = loopBoundary;
        const startOutDistance = startAnchor === 'left' ? -PADDING : PADDING;
        const endOutDistance = endAnchor === 'left' ? -PADDING : PADDING; // Assumes endAnchor is the same side
        const c1 = { x: start.x + startOutDistance, y: start.y };
        const c2 = { x: c1.x, y: yLoop };
        const c3 = { x: end.x + endOutDistance, y: yLoop };
        const c4 = { x: c3.x, y: end.y };
        return [c1, c2, c3, c4];
      } else {
        // loopSide is 'left' or 'right'
        const xLoop = loopBoundary;
        const startOutDistance = startAnchor === 'top' ? -PADDING : PADDING;
        const endOutDistance = endAnchor === 'top' ? -PADDING : PADDING; // Assumes endAnchor is the same side
        const c1 = { x: start.x, y: start.y + startOutDistance };
        const c2 = { x: xLoop, y: c1.y };
        const c3 = { x: xLoop, y: end.y + endOutDistance };
        const c4 = { x: end.x, y: c3.y };
        return [c1, c2, c3, c4];
      }
    }
    // Note: The logic for LOCAL_RELATIVE_BOX would need to be handled inside
    // computeOrthogonalCorners, as it is here. This seems fine.
  }
  // Fallback, though should not be reached if instruction types are correct
  return [];
}

/**
 * [CORRECTED VERSION]
 * Builds the corner points for a simple 3-leg (elbow) path for same-side connections.
 * This robust version ensures the path's main channel is always outside both the
 * start and end points, guaranteeing a clean entry and exit path.
 *
 * @param start The starting coordinate of the path.
 * @param end The ending coordinate of the path.
 * @param anchor The anchor side ('left', 'right', 'top', 'bottom'), which must be the same for start and end.
 * @param padding The distance to extend outward from the shapes before turning.
 * @returns An array of two IPoint objects representing the corners of the elbow path.
 */
function buildRobustElbowPath(
  start: IPoint,
  end: IPoint,
  anchor: TAnchorPosition,
  padding: number,
): IPoint[] {
  let c1: IPoint, c2: IPoint;
  const isHorizontal = anchor === 'left' || anchor === 'right';

  if (isHorizontal) {
    // For left/right anchors, the main channel is a vertical line.
    // Its X-coordinate must be outside of both start.x and end.x.
    const outwardX =
      anchor === 'left'
        ? Math.min(start.x, end.x) - padding // Furthest to the left
        : Math.max(start.x, end.x) + padding; // Furthest to the right

    c1 = { x: outwardX, y: start.y };
    c2 = { x: outwardX, y: end.y };
  } else {
    // isVertical
    // For top/bottom anchors, the main channel is a horizontal line.
    // Its Y-coordinate must be outside of both start.y and end.y.
    const outwardY =
      anchor === 'top'
        ? Math.min(start.y, end.y) - padding // Highest up (smallest Y)
        : Math.max(start.y, end.y) + padding; // Lowest down (largest Y)

    c1 = { x: start.x, y: outwardY };
    c2 = { x: end.x, y: outwardY };
  }
  return [c1, c2];
}

/**
 * Builds the corner points for a dynamic 5-leg U-turn path.
 * This path is ideal for same-side connections that are not aligned.
 * It calculates the middle leg's position as the midpoint between the
 * start and end points, creating a short and direct U-turn.
 *
 * @param start The starting coordinate of the path.
 * @param end The ending coordinate of the path.
 * @param anchor The anchor side ('left', 'right', 'top', 'bottom').
 * @param padding The distance to extend outward from the shapes.
 * @returns An array of four IPoint objects representing the corners of the U-turn path.
 */
function buildDynamicUturnPath(
  start: IPoint,
  end: IPoint,
  anchor: TAnchorPosition,
  padding: number,
): IPoint[] {
  let c1: IPoint, c2: IPoint, c3: IPoint, c4: IPoint;
  const isHorizontal = anchor === 'left' || anchor === 'right';

  if (isHorizontal) {
    const startOutwardX =
      anchor === 'left' ? start.x - padding : start.x + padding;
    // CRITICAL: Calculate an outward point for the end as well.
    const endOutwardX = anchor === 'left' ? end.x - padding : end.x + padding;
    // CRITICAL: The middle leg is at the Y-midpoint between start and end.
    const midY = (start.y + end.y) / 2;

    c1 = { x: startOutwardX, y: start.y }; // 1. Out from source
    c2 = { x: startOutwardX, y: midY }; // 2. To vertical midpoint
    c3 = { x: endOutwardX, y: midY }; // 3. Across to target's vertical lane
    c4 = { x: endOutwardX, y: end.y }; // 4. Align with target's Y
  } else {
    // isVertical
    const startOutwardY =
      anchor === 'top' ? start.y - padding : start.y + padding;
    // CRITICAL: Calculate an outward point for the end as well.
    const endOutwardY = anchor === 'top' ? end.y - padding : end.y + padding;
    // CRITICAL: The middle leg is at the X-midpoint between start and end.
    const midX = (start.x + end.x) / 2;

    c1 = { x: start.x, y: startOutwardY }; // 1. Out from source
    c2 = { x: midX, y: startOutwardY }; // 2. To horizontal midpoint
    c3 = { x: midX, y: endOutwardY }; // 3. Across to target's horizontal lane
    c4 = { x: end.x, y: endOutwardY }; // 4. Align with target's X
  }
  return [c1, c2, c3, c4];
}

/**
 * [NEW HELPER]
 * Builds a 2-corner "C-shaped" path. This is the simplest U-turn shape.
 */
function build_C_Shape_Path(
  start: IPoint,
  end: IPoint,
  side: TAnchorPosition,
): IPoint[] {
  // This logic is simple and produces exactly 2 corners.
  const turnOutCoordinate = calculateSameSideTurnOutCoordinate(
    start,
    end,
    side,
  );
  const isHorizontalTurn = side === 'left' || side === 'right';

  if (isHorizontalTurn) {
    return [
      { x: turnOutCoordinate, y: start.y },
      { x: turnOutCoordinate, y: end.y },
    ];
  } else {
    return [
      { x: start.x, y: turnOutCoordinate },
      { x: end.x, y: turnOutCoordinate },
    ];
  }
}

/**
 * [The Unified Builder]
 * Builds a 5-leg path structure that can represent either a visible U-turn or a
 * collapsed elbow, based on the `isCollapsed` argument.
 *
 * This unified approach ensures the data structure is always consistent,
 * guaranteeing smooth animations between the two visual states.
 *
 * @param isCollapsed If true, creates a "collapsed" path where the middle
 *        segment has zero length, appearing as a 3-leg elbow.
 * @returns An array of four IPoint objects representing the path's corners.
 */
function buildUturnPath(
  start: IPoint,
  end: IPoint,
  anchor: TAnchorPosition,
  padding: number,
  isCollapsed: boolean,
): IPoint[] {
  let c1: IPoint, c2: IPoint, c3: IPoint, c4: IPoint;
  const isHorizontal = anchor === 'left' || anchor === 'right';

  if (isHorizontal) {
    const midY = (start.y + end.y) / 2;

    if (isCollapsed) {
      // --- ELBOW LOGIC: Create a collapsed middle segment ---
      const outwardX =
        anchor === 'left'
          ? Math.min(start.x, end.x) - padding
          : Math.max(start.x, end.x) + padding;

      c1 = { x: outwardX, y: start.y };
      c4 = { x: outwardX, y: end.y };
      // c2 and c3 are identical, creating the "collapsed" point.
      c2 = { x: outwardX, y: midY };
      c3 = c2;
    } else {
      // --- U-TURN LOGIC: Create a visible middle segment ---
      const startOutwardX =
        anchor === 'left' ? start.x - padding : start.x + padding;
      const endOutwardX = anchor === 'left' ? end.x - padding : end.x + padding;

      c1 = { x: startOutwardX, y: start.y };
      c4 = { x: endOutwardX, y: end.y };
      // c2 and c3 have different X values, creating a visible "across" bar.
      c2 = { x: startOutwardX, y: midY };
      c3 = { x: endOutwardX, y: midY };
    }
  } else {
    // isVertical
    const midX = (start.x + end.x) / 2;

    if (isCollapsed) {
      // --- ELBOW LOGIC ---
      const outwardY =
        anchor === 'top'
          ? Math.min(start.y, end.y) - padding
          : Math.max(start.y, end.y) + padding;
      c1 = { x: start.x, y: outwardY };
      c4 = { x: end.x, y: outwardY };
      c2 = { x: midX, y: outwardY };
      c3 = c2;
    } else {
      // --- U-TURN LOGIC ---
      const startOutwardY =
        anchor === 'top' ? start.y - padding : start.y + padding;
      const endOutwardY = anchor === 'top' ? end.y - padding : end.y + padding;
      c1 = { x: start.x, y: startOutwardY };
      c4 = { x: end.x, y: endOutwardY };
      c2 = { x: midX, y: startOutwardY };
      c3 = { x: midX, y: endOutwardY };
    }
  }

  return [c1, c2, c3, c4];
}

/**
 * A stateful diagnostic tool for logging the frame-by-frame difference in a path's geometry.
 * It compares the new path to the previously logged path and highlights large changes.
 *
 * @param newPath - The array of 4 corner points for the current frame.
 * @param type - A string ('ELBOW' or 'U-TURN') to label the log output.
 * @param previousPathRef - A React ref object used to store the path from the previous frame.
 */
function logPathDiff(
  newPath: IPoint[],
  type: 'ELBOW' | 'U-TURN',
  previousPathRef: React.RefObject<IPoint[] | null>,
) {
  // Simple distance formula helper
  const distance = (p1: IPoint, p2: IPoint) =>
    Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

  const previousPath = previousPathRef.current;

  // On the first run, there's nothing to compare. Just store the path and exit.
  if (!previousPath) {
    previousPathRef.current = newPath;
    return;
  }

  // --- Calculations for the new path ---
  const [nc1, nc2, nc3, nc4] = newPath;
  const newMidSegmentLength = distance(nc2, nc3);

  // --- Calculations for the previous path ---
  const [pc1, pc2, pc3, pc4] = previousPath;
  const prevMidSegmentLength = distance(pc2, pc3);

  // --- Start the formatted log group ---

  // IMPORTANT: Update the ref with the new path for the next frame's comparison.
  previousPathRef.current = newPath;
}

export function computeOrthogonalCorners(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  instruction: RoutingInstruction,
  previousPathRef: RefObject<IPoint[] | null>,
): IPoint[] {
  // console.log(
  //   `[computeOrthogonalCorners] Routing for instruction type: ${instruction.type}`,
  //   startAnchor,
  //   endAnchor
  // );

  switch (instruction.type) {
    case 'INTER_CONTAINER_BOX':
      // console.log(
      //   "[computeOrthogonalCorners] Using 'INTER_CONTAINER_BOX' routing logic",
      //   instruction
      // );

      // This instruction type can be drawn by the same logic as a container-aware box,
      // because we have already calculated the correct boundary.
      return buildObstructedUturnCorners(start, end, startAnchor, endAnchor, {
        type: 'OBSTRUCTED_U_TURN_BOX',
        connectionSide: startAnchor,
        loopSide: instruction.loopSide,
        loopBoundary: instruction.loopBoundary,
      });

    // case 'INTER_CONTAINER_ELBOW': {
    //   console.log(
    //     "[computeOrthogonalCorners] Using 'INTER_CONTAINER_ELBOW' routing logic"
    //   );

    //   // Call the new, clean function instead of having the logic inline
    //   return buildRobustElbowPath(start, end, startAnchor, PADDING);
    // }

    // // --- NEW CASE ---
    // case 'INTER_CONTAINER_U_TURN': {
    //   console.log(
    //     "[computeOrthogonalCorners] Using 'INTER_CONTAINER_U_TURN' logic"
    //   );
    //   return buildDynamicUturnPath(start, end, startAnchor, PADDING);
    // }

    // TODO-OOO
    case 'INTER_CONTAINER_ELBOW':
    case 'INTER_CONTAINER_U_TURN': {
      // This single block now handles both cases perfectly.

      // console.log('[computeOrthogonalCorners] Input Points:', { start, end }); // <-- ADD THIS LOG

      // The controlling signal is whether the instruction is 'ELBOW'.
      const isCollapsed = instruction.type === 'INTER_CONTAINER_ELBOW';
      const pathType = isCollapsed ? 'ELBOW' : 'U-TURN';

      const startRef = routingRefPoint(startAnchor, start, 'source');

      const corners = buildUturnPath(
        startRef,
        end,
        startAnchor,
        PADDING,
        isCollapsed,
      );

      // logPathDiff(corners, pathType, previousPathRef);

      return corners;
    }

    case 'OBSTRUCTED_U_TURN':
      // This instruction requires the simple, 2-corner C-Shape.
      return build_C_Shape_Path(start, end, instruction.connectionSide);

    case 'LOCAL_RELATIVE_U_TURN': {
      // This is a same-axis connection, so startAnchor is all that's needed.
      // return buildLocalRelativeUturnCorners(start, end, startAnchor, PADDING);
      return buildLocalRelativeUturnCorners(start, end, startAnchor, endAnchor);
    }

    // only two found in the codebase
    case 'LOCAL_RELATIVE_ELBOW': {
      // This is a mixed-axis connection.
      // return buildLocalElbowCorners(start, end, startAnchor);
      return buildLocalElbowCorners(start, end, startAnchor, endAnchor);
    }
    case 'HORIZONTAL_SELF_LOOP':
      return buildHorizontalSelfLoopCorners(
        start,
        end,
        startAnchor,
        endAnchor,
        instruction.y,
      );

    case 'VERTICAL_SELF_LOOP':
      return buildVerticalSelfLoopCorners(
        start,
        end,
        startAnchor,
        endAnchor,
        instruction.x,
      );

    // case 'OBSTRUCTED_U_TURN':
    case 'OBSTRUCTED_U_TURN_BOX':
      return buildObstructedUturnCorners(
        start,
        end,
        startAnchor,
        endAnchor,
        instruction,
      );

    case 'NO_LOOP': {
      // console.log("[computeOrthogonalCorners] Using 'NO_LOOP' routing logic");

      // The default logic for all other connections.
      return buildDefaultCorners(start, end, startAnchor, endAnchor);
    }

    default: {
      return buildDefaultCorners(start, end, startAnchor, endAnchor);
    }
  }
}

// ========================================================================
// Path Builder Functions
// ========================================================================

/** The desired visual style of the path. */
export type PathStyle = 'smooth' | 'sharp' | 'sharp-animatable';

/** The return type for path builder functions. */
type PathAndWaypoints = {
  path: string;
  waypoints: [IPoint, IPoint];
};

/** The final return type for the main public API function. */
export type ArrowPathData = {
  path: string;
  labelPosition: IPoint;
};

/**
 * Builds a smooth SVG path using a single cubic Bézier curve command ('C').
 *
 * This function calculates two off-path control points that pull the line
 * into a smooth "S" shape, ideal for visually pleasing, organic connections.
 *
 * @returns An object containing the path string and the control points used.
 */
export function buildBezierCurvePath(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
): PathAndWaypoints {
  // 1. Get the two off-path control points that define the curve's shape.
  const [sourceControlPoint, targetControlPoint] = computeCurveControlPoints(
    start,
    end,
    startAnchor,
    endAnchor,
  );

  // 2. Build the path string using a single 'C' (curve) command.
  //    The path goes from 'start' to 'end', pulled towards the two control points.
  // prettier-ignore
  const pathData = [
    'M', `${start.x},${start.y}`,
    'C', `${sourceControlPoint.x},${sourceControlPoint.y}`,
         `${targetControlPoint.x},${targetControlPoint.y}`,
         `${end.x},${end.y}`,
  ];

  return {
    path: pathData.join(' '),
    waypoints: [sourceControlPoint, targetControlPoint],
  };
}

/**
 * Builds a sharp, orthogonal path using multiple line commands ('L').
 *
 * This function calculates two on-path corners and connects the start, corners,
 * and end points with straight line segments, creating a "Manhattan" or
 * "elbow" style path.
 *
 * @returns An object containing the path string and the corners used.
 */

export function buildPolylinePathUsed(
  startPoint: IPoint,
  endPoint: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  instruction: RoutingInstruction,
  previousPathRef: RefObject<IPoint[] | null>,
): PathAndWaypoints {
  /* ------------------------------------------------------------------
   * 1.  Get the two canonical corners from the router
   *     (calculateSameSideWaypoints for same-axis links,
   *      calculateMixedSideElbowPoints for mixed-axis links).
   * ------------------------------------------------------------------ */
  const corners = computeOrthogonalCorners(
    startPoint,
    endPoint,
    startAnchor,
    endAnchor,
    instruction,
    previousPathRef,
  ); // returns a tuple [firstCorner, lastCorner]

  /* ------------------------------------------------------------------
   * 2.  See if the router attached a “hidden” middle corner (_middle) for
   *     mixed-axis links.  If so, insert it between the two canonical ones
   *     when we draw the SVG path.  Same-axis links have no _middle.
   * ------------------------------------------------------------------ */
  const middle = (corners as any)._middle as IPoint | undefined;
  const drawCorners: IPoint[] = middle
    ? [corners[0], middle, corners[1]] // three-corner elbow
    : corners; // classic two-corner U-turn

  /* ------------------------------------------------------------------
   * 3.  Assemble the ‘d’ attribute for an orthogonal poly-line path
   * ------------------------------------------------------------------ */
  const dParts: string[] = ['M', `${startPoint.x},${startPoint.y}`];
  drawCorners.forEach((p) => dParts.push('L', `${p.x},${p.y}`));
  dParts.push('L', `${endPoint.x},${endPoint.y}`); // final segment into target

  /* ------------------------------------------------------------------
   * 4.  Return the SVG path + the first & last corner (waypoints) so that
   *     label positioning and other code continues to work unchanged.
   * ------------------------------------------------------------------ */
  return {
    path: dParts.join(' '),
    waypoints: [corners[0], corners[1]], // always just first & last
  };
}

/**
 * [REVISED AND SIMPLIFIED]
 * Builds the final SVG path string and waypoints from a pre-calculated array
 * of corner points.
 *
 * This function is now much simpler, as the `computeOrthogonalCorners` helper
 * is responsible for returning the exact sequence of points needed for any
 * given path type (e.g., a 4-point array for a U-turn/Elbow).
 */
export function buildPolylinePath(
  startPoint: IPoint,
  endPoint: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  instruction: RoutingInstruction,
  previousPathRef: RefObject<IPoint[] | null>,
): PathAndWaypoints {
  /* ------------------------------------------------------------------
   * 1.  Get the complete, ordered array of corner points.
   *     The `computeOrthogonalCorners` function now handles all path-specific
   *     logic and returns the exact points needed for drawing.
   * ------------------------------------------------------------------ */
  const corners: IPoint[] = computeOrthogonalCorners(
    startPoint,
    endPoint,
    startAnchor,
    endAnchor,
    instruction,
    previousPathRef,
  );

  /* ------------------------------------------------------------------
   * 2.  Assemble the ‘d’ attribute for an orthogonal poly-line path.
   *     This logic is now simplified, as it just needs to iterate through
   *     the provided `corners` array.
   * ------------------------------------------------------------------ */
  const dParts: string[] = [`M ${startPoint.x},${startPoint.y}`];
  corners.forEach((p) => dParts.push(`L ${p.x},${p.y}`));
  dParts.push(`L ${endPoint.x},${endPoint.y}`); // Final segment into target

  /* ------------------------------------------------------------------
   * 3.  Determine waypoints for label positioning.
   *     For compatibility, we still provide the first and last corners,
   *     which are suitable for most label positioning strategies.
   * ------------------------------------------------------------------ */
  const waypoints: [IPoint, IPoint] =
    corners.length > 0
      ? [corners[0], corners[corners.length - 1]]
      : [startPoint, endPoint]; // Fallback for straight lines with no corners

  /* ------------------------------------------------------------------
   * 4.  Return the final path and waypoints.
   * ------------------------------------------------------------------ */
  return {
    path: dParts.join(' '),
    waypoints: waypoints,
  };
}
/**
 * Builds a sharp, orthogonal-looking path using multiple cubic Bézier
 * curve commands ('C').
 *
 * This function creates a path that is visually identical to the polyline path,
 * but is constructed in a way that is friendly to path morphing animations.
 * The sharp corners are achieved by "stacking" the control points at the
 * corner vertices, forcing the curve command to draw a straight line.
 *
 * @returns An object containing the path string and the corners used as waypoints.
 */
export function buildPolycurvePath(
  start: IPoint,
  end: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  instruction: RoutingInstruction,
  previousPathRef: RefObject<IPoint[] | null>,
): PathAndWaypoints {
  // 1. Get the corner points using the same logic as the orthogonal path.
  //    These are the points where we want the sharp turns to happen.
  const [sourceCorner, targetCorner] = computeOrthogonalCorners(
    start,
    end,
    startAnchor,
    endAnchor,
    instruction,
    previousPathRef,
  );

  // 2. Build the path string using three consecutive 'C' (curve) commands.

  // Segment 1: From 'start' to 'sourceCorner'. To make a straight line,
  // both control points and the segment's end point are all 'sourceCorner'.
  const segment1 = `C ${sourceCorner.x},${sourceCorner.y} ${sourceCorner.x},${sourceCorner.y} ${sourceCorner.x},${sourceCorner.y}`;

  // Segment 2: From 'sourceCorner' to 'targetCorner'. The start is implicitly
  // sourceCorner; both control points and the segment's end point are 'targetCorner'.
  const segment2 = `C ${targetCorner.x},${targetCorner.y} ${targetCorner.x},${targetCorner.y} ${targetCorner.x},${targetCorner.y}`;

  // Segment 3: From 'targetCorner' to 'end'. The start is implicitly
  // targetCorner; both control points and the segment's end point are 'end'.
  const segment3 = `C ${end.x},${end.y} ${end.x},${end.y} ${end.x},${end.y}`;

  const path = `M ${start.x},${start.y} ${segment1} ${segment2} ${segment3}`;

  return {
    path: path,
    waypoints: [sourceCorner, targetCorner], // The waypoints are still the geometric corners.
  };
}

/**
 * Calculates the best position for an arrow's label based on the path's shape.
 *
 * This function uses a path-aware strategy to ensure the label is always
 * placed in a visually sensible location.
 *
 * - For "same-side" connections (which form a U-turn), it places the label on the
 *   midpoint of the path's main traversal segment for perfect alignment.
 * - For "mixed-side" connections (S-curves or elbows), it uses the simple
 *   midpoint between the start and end of the arrow, which is a sensible default.
 *
 * @param startPoint - The starting point of the arrow's visible stroke.
 * @param endPoint - The ending point of the arrow's visible stroke.
 * @param sourceWaypoint - The first intermediate waypoint, associated with the source.
 *   This can be a control point (for curves) or a corner (for lines).
 * @param targetWaypoint - The second intermediate waypoint, associated with the target.
 * @param startAnchor - The anchor position of the source element.
 * @param endAnchor - The anchor position of the target element.
 * @returns An IPoint `{ x, y }` for the label's center.
 */
export function computeLabelPosition(
  startPoint: IPoint,
  endPoint: IPoint,
  sourceWaypoint: IPoint,
  targetWaypoint: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
): IPoint {
  // Case 1: Same-side connection (U-turn).
  // The label should be placed on the midpoint of the middle segment of the path,
  // which is the line connecting the two waypoints.
  if (startAnchor === endAnchor) {
    return {
      x: (sourceWaypoint.x + targetWaypoint.x) / 2,
      y: (sourceWaypoint.y + targetWaypoint.y) / 2,
    };
  }

  // Case 2: Mixed-side connection (S-curve or elbow).
  // The simple geometric center between the start and end points is a robust default.
  return {
    x: (startPoint.x + endPoint.x) / 2,
    y: (startPoint.y + endPoint.y) / 2,
  };
}

export type ArrowGeometry = {
  path: string;
  label: IPoint;
};

/**
 * Builds the complete, final geometry for a simple, direct straight-line
 * connection.
 *
 * This function is a self-contained builder for the simplest path type.
 * Unlike other builders that produce intermediate data (like waypoints) which
 * require further processing, this function calculates the final `path` string
 * and `label` position directly.
 *
 * @param startPoint The starting coordinates of the arrow's visible stroke.
 * @param endPoint The ending coordinates of the arrow's visible stroke.
 * @returns A complete `ArrowGeometry` object, ready for rendering.
 */
function buildStraightLinePath(
  startPoint: IPoint,
  endPoint: IPoint,
): ArrowGeometry {
  /**
   * The SVG path for a straight line is defined by two commands:
   * 1. `M` (moveto): Places the drawing cursor at the start point.
   * 2. `L` (lineto): Draws a straight line to the end point.
   */
  const path = `M ${startPoint.x},${startPoint.y} L ${endPoint.x},${endPoint.y}`;

  /**
   * For a straight line, the most intuitive and correct label position is the
   * exact geometric midpoint of the line segment.
   */
  const label = {
    x: (startPoint.x + endPoint.x) / 2,
    y: (startPoint.y + endPoint.y) / 2,
  };

  /**
   * This function returns the final `ArrowGeometry` object directly.
   * It does not return intermediate `waypoints` because a straight line has no
   * corners or control points that would require further processing by the
   * calling function.
   */
  return { path, label };
}

/**
 * A private helper that handles the construction of all complex, multi-segment
 * paths, such as orthogonal polylines or smooth Bézier curves.
 *
 * This function encapsulates all logic for:
 * 1. Determining the effective path style (e.g., forcing 'sharp' for U-turns).
 * 2. Delegating to the appropriate low-level path builder (`buildPolylinePath`,
 *    etc.).
 * 3. Computing the final label position based on the path's resulting
 *    waypoints.
 *
 * It features a "smart default" for the path style: if no style is provided, it
 * will automatically use a 'sharp' path for same-side connections (to ensure a
 * clean U-turn) and the specified `pathStyle` (or 'sharp') for all others.
 *
 * @param startPoint The starting coordinates of the arrow.
 * @param endPoint The ending coordinates of the arrow.
 * @param startAnchor The logical anchor position of the source.
 * @param endAnchor The logical anchor position of the target.
 * @param instruction The routing instruction (guaranteed not to be 'STRAIGHT_LINE').
 * @param pathStyle (Optional) The desired visual style for the path.
 * @returns A complete `ArrowGeometry` object for the complex path.
 */
function buildComplexPath(
  startPoint: IPoint,
  endPoint: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  instruction: Exclude<RoutingInstruction, { type: 'STRAIGHT_LINE' }>,
  previousPathRef: RefObject<IPoint[] | null>,
  pathStyle?: PathStyle,
): ArrowGeometry {
  /**
   * 1. Determine the effective path style to use.
   *    This logic ensures that connections which require a sharp U-turn are
   *    always rendered as a 'sharp' polyline, overriding any other style.
   */
  let effectivePathStyle: PathStyle;
  if (startAnchor === endAnchor) {
    // Rule: Same-side connections MUST use the 'sharp' style to render a
    // clean U-turn. This is a mandatory override and is not configurable.
    effectivePathStyle = 'sharp';
  } else {
    // Rule: For all other (mixed-side) connections, use the user-provided
    // style. If no style is provided, default to 'sharp'.
    effectivePathStyle = pathStyle || 'sharp';
  }

  /**
   * 2. Delegate to the specific low-level path builder.
   *    Based on the determined style, we call the specialist function
   *    responsible for creating that type of path. This returns the path string
   *    and the intermediate waypoints used to construct it.
   */
  let builderResult: PathAndWaypoints;
  switch (effectivePathStyle) {
    case 'smooth':
      builderResult = buildBezierCurvePath(
        startPoint,
        endPoint,
        startAnchor,
        endAnchor,
      );
      break;

    case 'sharp-animatable':
      builderResult = buildPolycurvePath(
        startPoint,
        endPoint,
        startAnchor,
        endAnchor,
        instruction,
        previousPathRef,
      );
      break;

    case 'sharp':
    default:
      builderResult = buildPolylinePathUsed(
        startPoint,
        endPoint,
        startAnchor,
        endAnchor,
        instruction,
        previousPathRef,
      );
      break;
  }

  /**
   * 3. Calculate the final label position.
   *    Using the waypoints returned from the builder, we calculate the optimal
   *    position for the arrow's label. This logic is smart enough to place the
   *    label correctly for both U-turns and S-curves/elbows.
   */
  const { path, waypoints } = builderResult;
  const [sourceWaypoint, targetWaypoint] = waypoints;

  const labelPosition = computeLabelPosition(
    startPoint,
    endPoint,
    sourceWaypoint,
    targetWaypoint,
    startAnchor,
    endAnchor,
  );

  // Finally, return the complete geometry object.
  return { path, label: labelPosition };
}

/**
 * The main public API for computing the complete geometry of an arrow.
 *
 * This function acts as a high-level dispatcher. It inspects the provided
 * `instruction` and delegates the path construction to the appropriate
 * specialized builder function by following a clear, prioritized logic:
 *
 * 1. Simple Path (`STRAIGHT_LINE`):
 *    If the instruction is for a direct, unobstructed connection, it
 *    immediately delegates to `buildStraightLinePath` and returns the result.
 *
 * 2.  Complex Path (All Others):
 *     For any other instruction type (e.g., `NO_LOOP`, `INTER_CONTAINER_BOX`),
 *     it delegates the entire process to `buildComplexPath`, which handles all
 *     multi-segment paths like elbows, U-turns, and curves.
 *
 * @param startPoint The starting coordinates of the arrow's visible stroke.
 * @param endPoint The ending coordinates of the arrow's visible stroke.
 * @param startAnchor The logical anchor position of the source.
 * @param endAnchor The logical anchor position of the target.
 * @param instruction The routing instruction that dictates which path shape to use.
 * @param pathStyle (Optional) The desired visual style ('sharp', 'smooth', etc.)
 *                  for complex paths.
 * @returns A complete `ArrowGeometry` object containing the final `path` string
 *          and `label` position, ready for rendering.
 */
export function computeArrowGeometry(
  startPoint: IPoint,
  endPoint: IPoint,
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  instruction: RoutingInstruction,
  previousPathRef: RefObject<IPoint[] | null>,
  pathStyle?: PathStyle,
): ArrowGeometry {
  /**
   * 1. The Simple Path
   *    Handle the trivial case of a direct, straight line.
   *    This is the highest priority check. If it matches, we delegate to the
   *    specialized straight line builder and return immediately.
   */
  if (instruction.type === 'STRAIGHT_LINE') {
    return buildStraightLinePath(startPoint, endPoint);
  }

  /**
   * 2. The Complex Path
   *    If the instruction is not for a straight line, it must be for a more
   *    complex, multi-segment path. We delegate the entire process of building
   *    this path to the `buildComplexPath` helper function.
   */
  return buildComplexPath(
    startPoint,
    endPoint,
    startAnchor,
    endAnchor,
    instruction,
    previousPathRef,
    pathStyle,
  );
}
