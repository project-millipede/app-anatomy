import { IPoint, TAnchorPosition, TAxis } from '../types';
import { getAdjacencyRelationFromSelector } from './utils-with-cache';

/**
 * Determines if two anchor positions are on the same logical axis, meaning
 * either both are horizontal or both are vertical.
 *
 * This function is a core primitive for classifying connection types and uses
 * an explicit, multi-step check for maximum clarity.
 *
 * @param startAnchor The logical position of the source anchor.
 * @param endAnchor The logical position of the target anchor.
 * @returns `true` if the anchors share the same axis, `false` otherwise.
 */
export const isSameAxis = (
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
): boolean => {
  /**
   * First, check if both anchors belong to the horizontal axis.
   * An anchor is considered horizontal if its position is 'left' or 'right'.
   */
  const isStartHorizontal = startAnchor === 'left' || startAnchor === 'right';
  const isEndHorizontal = endAnchor === 'left' || endAnchor === 'right';

  if (isStartHorizontal && isEndHorizontal) {
    return true;
  }

  /**
   * If the horizontal check failed, check if both anchors belong to the
   * vertical axis.
   * An anchor is considered vertical if its position is 'top' or 'bottom'.
   */
  const isStartVertical = startAnchor === 'top' || startAnchor === 'bottom';
  const isEndVertical = endAnchor === 'top' || endAnchor === 'bottom';

  if (isStartVertical && isEndVertical) {
    return true;
  }

  /**
   * If neither the horizontal nor the vertical checks passed, the anchors must
   * lie on different axes.
   */
  return false;
};

/**
 * Determines if two anchor types are logically opposite.
 *
 * Logically opposite anchors are essential for creating straight-line
 * connections.
 * This function returns `true` for the following opposing pairs:
 * - `right` and `left`
 * - `top` and `bottom`
 *
 * It implements this by checking two conditions derived from the definition of
 * "opposite":
 * 1. The anchors must be on the same logical axis (`isSameAxis`).
 * 2. The anchors must not be of the same type (e.g., `left` vs. `right`).
 *
 * @param sourceAnchor The logical position of the source anchor.
 * @param targetAnchor The logical position of the target anchor.
 * @returns `true` if the anchors are opposing, `false` otherwise.
 */
export const areOpposingAnchors = (
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
): boolean => {
  // To be opposing, anchors must be on the same axis but not be identical.
  return (
    isSameAxis(sourceAnchor, targetAnchor) && sourceAnchor !== targetAnchor
  );
};

/**
 * A geometric check to determine if two points are aligned on a specific axis,
 * within a given pixel tolerance.
 *
 * This is a fundamental primitive for verifying that a logical layout intent
 * matches the actual rendered positions of elements on the screen.
 *
 * @param sourcePoint The coordinates of the first point.
 * @param targetPoint The coordinates of the second point.
 * @param axis The axis ('horizontal' or 'vertical') along which to check for alignment.
 * @returns `true` if the points are aligned on the specified axis, `false` otherwise.
 */
export function areGeometricallyAligned(
  sourcePoint: IPoint,
  targetPoint: IPoint,
  axis: TAxis,
): boolean {
  // A small tolerance is used to account for potential sub-pixel rendering
  // differences in browsers.
  const ALIGNMENT_TOLERANCE = 1;

  /**
   * The delta (absolute difference) to check is determined by the chosen axis.
   * - For 'horizontal' alignment, the delta of the x-coordinates is used.
   * - For 'vertical' alignment, the delta of the y-coordinates is used.
   */
  const delta =
    axis === 'horizontal'
      ? Math.abs(sourcePoint.x - targetPoint.x)
      : Math.abs(sourcePoint.y - targetPoint.y);

  // The final result is true only if the calculated delta is within the
  // tolerance.
  return delta < ALIGNMENT_TOLERANCE;
}

/**
 * Checks if the two logical segments that contain the source and target anchors
 * are immediate siblings in the DOM tree. This is the definitive metric for
 * determining if two elements in a sequential layout are "direct neighbors."
 *
 * This function is designed to be robust and clear by following these steps:
 * 1.  It identifies the logical parent container (`[data-archer-id]`) of each
 *     anchor point.
 * 2.  It handles edge cases where containers cannot be found or are the same
 *     element.
 * 3.  It uses a clear, readable check to determine adjacency from the single
 *     perspective of the source element.
 *
 * @param sourceElement The DOM element of the source anchor point.
 * @param targetElement The DOM element of the target anchor point.
 * @returns `true` if the segments are immediate siblings, `false` otherwise.
 */
function areSegmentsAdjacent(
  sourceElement: Element,
  targetElement: Element,
): boolean {
  /**
   * 1. Identify the logical parent container for each anchor.
   *    The refs point to the tiny anchor elements, but for adjacency, the check
   *    must be performed on their containing segments, which are marked with
   *    the `data-archer-id` attribute.
   */
  const sourceSegmentContainer = sourceElement.closest('[data-archer-id]');
  const targetSegmentContainer = targetElement.closest('[data-archer-id]');

  /**
   * 2. Handle edge cases to ensure a valid comparison.
   *    This block contains multiple checks to guard against invalid states.
   */

  /**
   * 2a. Check if parent containers were successfully found.
   *     If a container is missing, adjacency is indeterminate and must be
   *     false.
   */
  if (!sourceSegmentContainer || !targetSegmentContainer) {
    console.warn(
      '[areSegmentsAdjacent] Could not find parent segment container for an anchor.',
    );
    return false;
  }

  /**
   * 2b. Check if the containers are the same element.
   *     A segment cannot be adjacent to itself. This also correctly handles the
   *     case where a source and target anchor are on the same visual segment.
   *
   *     Note: This explicit check is kept for clarity.
   *     The sibling logic in step 3 would also implicitly handle this case.
   */
  if (sourceSegmentContainer === targetSegmentContainer) {
    return false;
  }

  /**
   * 3. Use a clear, single-perspective check to determine adjacency.
   *    This logic answers the question: "Is the target segment the element
   *    immediately after the source, OR immediately before it?"
   */
  const isTargetTheNextSibling =
    sourceSegmentContainer.nextElementSibling === targetSegmentContainer;

  const isTargetThePreviousSibling =
    sourceSegmentContainer.previousElementSibling === targetSegmentContainer;

  // The elements are adjacent if either of the sibling conditions is true.
  return isTargetTheNextSibling || isTargetThePreviousSibling;
}

/**
 * Checks if the anchor orientation is correct for the specific adjacency
 * of two elements (i.e., next or previous sibling).
 *
 * This is the crucial, direction-aware check that prevents "backwards"
 * straight-line connections. For example, if element B is the `nextElementSibling`
 * of element A, this function ensures the connection must be `right` -> `left`.
 *
 * @returns `true` if the orientation matches the adjacency, `false` otherwise.
 */
function isOrientationCorrectForAdjacency(
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
  sourceElement: Element,
  targetElement: Element,
): boolean {
  const sourceContainer = sourceElement.closest('[data-archer-id]');
  const targetContainer = targetElement.closest('[data-archer-id]');

  if (!sourceContainer || !targetContainer) {
    return false; // Cannot determine orientation if containers are missing
  }

  // Case 1: Target is the NEXT sibling (e.g., a left-to-right flow)
  if (sourceContainer.nextElementSibling === targetContainer) {
    // For a horizontal flow, connection must be RIGHT -> LEFT.
    if (sourceAnchor === 'right' && targetAnchor === 'left') return true;
    // For a vertical flow, connection must be BOTTOM -> TOP.
    if (sourceAnchor === 'bottom' && targetAnchor === 'top') return true;
  }

  // Case 2: Target is the PREVIOUS sibling (e.g., a right-to-left flow)
  if (sourceContainer.previousElementSibling === targetContainer) {
    // For a horizontal flow, connection must be LEFT -> RIGHT.
    if (sourceAnchor === 'left' && targetAnchor === 'right') return true;
    // For a vertical flow, connection must be TOP -> BOTTOM.
    if (sourceAnchor === 'top' && targetAnchor === 'bottom') return true;
  }

  // If none of the valid directional pairs match, the orientation is incorrect.
  return false;
}

/**
 * The definitive metric for determining if a connection should be rendered as a
 * simple, straight line.
 *
 * This function is designed for maximum clarity by explicitly separating the logic
 * for horizontal and vertical connections. It confirms a "direct neighbor" relationship
 * by enforcing three strict conditions:
 *
 * 1. Logical: The source and target anchors must be logically opposing.
 * 2. Geometric: The anchor points must be perfectly aligned on the correct
 *    axis.
 * 3. Contextual: The logical segments must be immediate DOM neighbors.
 *
 * If any of these checks fail for a given direction, the function proceeds to
 * check the other direction or ultimately returns false.
 *
 * @param sourceElement The DOM element of the source anchor point.
 * @param targetElement The DOM element of the target anchor point.
 * @param sourcePoint The calculated {x, y} coordinates of the source anchor.
 * @param targetPoint The calculated {x, y} coordinates of the target anchor.
 * @param sourceAnchor The logical position ('top', 'right', etc.) of the source.
 * @param targetAnchor The logical position of the target.
 * @returns `true` if the connection is a true direct neighbor, `false` otherwise.
 */
export function isDirectNeighborX(
  sourceElement: Element,
  targetElement: Element,
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
): boolean {
  // --- Check for a HORIZONTAL straight line connection ---
  const isPotentiallyHorizontal =
    sourceAnchor === 'right' || sourceAnchor === 'left';
  if (isPotentiallyHorizontal) {
    // To be a horizontal straight line, all three conditions must be met:
    // 1. Anchors must be 'right' to 'left' or vice-versa.
    // 2. Their Y-coordinates must be aligned.
    // 3. Their parent segments must be immediate DOM siblings.
    return (
      areOpposingAnchors(sourceAnchor, targetAnchor) &&
      areGeometricallyAligned(sourcePoint, targetPoint, 'vertical') &&
      areSegmentsAdjacent(sourceElement, targetElement) &&
      // The NEW, crucial fourth condition for directionality:
      isOrientationCorrectForAdjacency(
        sourceAnchor,
        targetAnchor,
        sourceElement,
        targetElement,
      )
    );
  }

  // --- Check for a VERTICAL straight line connection ---
  const isPotentiallyVertical =
    sourceAnchor === 'top' || sourceAnchor === 'bottom';
  if (isPotentiallyVertical) {
    // To be a vertical straight line, all three conditions must be met:
    // 1. Anchors must be 'top' to 'bottom' or vice-versa.
    // 2. Their X-coordinates must be aligned.
    // 3. Their parent segments must be immediate DOM siblings.
    return (
      areOpposingAnchors(sourceAnchor, targetAnchor) &&
      areGeometricallyAligned(sourcePoint, targetPoint, 'horizontal') &&
      areSegmentsAdjacent(sourceElement, targetElement) &&
      // The NEW, crucial fourth condition for directionality:
      isOrientationCorrectForAdjacency(
        sourceAnchor,
        targetAnchor,
        sourceElement,
        targetElement,
      )
    );
  }

  // If the anchor is not horizontal or vertical (e.g., 'middle'),
  // or if the checks above failed, it cannot be a direct neighbor.
  return false;
}

/**
 * Checks if the anchor orientation is correct for a given adjacency type and axis.
 * This is a pure, stateless function with no DOM access, designed for clarity.
 *
 * @param adjacency The pre-calculated adjacency type ('next' or 'previous').
 * @param axis The logical axis being tested ('horizontal' or 'vertical').
 * @returns `true` if the anchor pair matches the adjacency direction for that axis.
 */
function isOrientationCorrect(
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
  adjacency: 'next' | 'previous',
  axis: TAxis,
): boolean {
  if (adjacency === 'next') {
    if (axis === 'horizontal')
      return sourceAnchor === 'right' && targetAnchor === 'left';
    if (axis === 'vertical')
      return sourceAnchor === 'bottom' && targetAnchor === 'top';
  }

  if (adjacency === 'previous') {
    if (axis === 'horizontal')
      return sourceAnchor === 'left' && targetAnchor === 'right';
    if (axis === 'vertical')
      return sourceAnchor === 'top' && targetAnchor === 'bottom';
  }

  return false;
}

/**
 * The definitive metric for determining if a connection should be rendered as a
 * simple, straight line.
 *
 * This function is designed for maximum clarity and efficiency. It first determines
 * the DOM adjacency type, then validates the connection against three strict rules:
 *
 * 1.  **Logical:** Anchors must be opposing (e.g., 'left' and 'right').
 * 2.  **Directional:** Anchor orientation must match the DOM order.
 * 3.  **Geometric:** Anchor points must be perfectly aligned.
 */
export function isDirectNeighbor(
  sourceElement: Element,
  targetElement: Element,
  sourcePoint: IPoint,
  targetPoint: IPoint,
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
): boolean {
  // 1. Get the adjacency relationship ONCE. This is our single DOM lookup.
  const adjacency = getAdjacencyRelationFromSelector(
    sourceElement,
    targetElement,
    '[data-archer-id]',
  );

  // 2. Contextual Check: If they aren't neighbors, fail immediately.
  // This replaces the need for a separate areSegmentsAdjacent() call.
  if (adjacency !== 'next' && adjacency !== 'previous') {
    return false;
  }

  // --- Check for a HORIZONTAL straight line connection ---
  const isPotentiallyHorizontal =
    sourceAnchor === 'right' || sourceAnchor === 'left';
  if (isPotentiallyHorizontal) {
    return (
      // Logical check (fast and readable)
      areOpposingAnchors(sourceAnchor, targetAnchor) &&
      // Directional check (using our pre-calculated adjacency)
      isOrientationCorrect(
        sourceAnchor,
        targetAnchor,
        adjacency,
        'horizontal',
      ) &&
      // Geometric check
      areGeometricallyAligned(sourcePoint, targetPoint, 'vertical')
    );
  }

  // --- Check for a VERTICAL straight line connection ---
  const isPotentiallyVertical =
    sourceAnchor === 'top' || sourceAnchor === 'bottom';
  if (isPotentiallyVertical) {
    return (
      // Logical check
      areOpposingAnchors(sourceAnchor, targetAnchor) &&
      // Directional check
      isOrientationCorrect(sourceAnchor, targetAnchor, adjacency, 'vertical') &&
      // Geometric check
      areGeometricallyAligned(sourcePoint, targetPoint, 'horizontal')
    );
  }

  return false;
}

/**
 * Important Note:
 * This function's logic partially overlaps with the higher-priority
 * `isDirectNeighbor` check. It is designed to be called *after*
 * `isDirectNeighbor` has already returned `false`. Its primary role is to
 * validate the remaining, more complex same-axis connection types that are not
 * simple straight lines.
 */
export function isConnectionAxisConsistent(
  startAnchor: TAnchorPosition,
  endAnchor: TAnchorPosition,
  startPoint: IPoint,
  endPoint: IPoint,
): boolean {
  // First gate: must be on the same axis (e.g. left/right or top/bottom)
  if (!isSameAxis(startAnchor, endAnchor)) {
    return false;
  }

  const isLogicallyHorizontal =
    startAnchor === 'left' || startAnchor === 'right';

  // Check geometric reality
  const deltaX = Math.abs(startPoint.x - endPoint.x);
  const deltaY = Math.abs(startPoint.y - endPoint.y);
  const isGeometricallyHorizontal = deltaX >= deltaY;

  // Case 1: Strict consistency (logic matches geometry)
  if (isLogicallyHorizontal === isGeometricallyHorizontal) {
    return true;
  }

  // Case 2: Permissive consistency (using our new primitive)
  // Logic is VERTICAL, but geometry is a perfect HORIZONTAL line
  if (
    !isLogicallyHorizontal &&
    areGeometricallyAligned(startPoint, endPoint, 'vertical')
  ) {
    return true;
  }
  // Logic is HORIZONTAL, but geometry is a perfect VERTICAL line
  if (
    isLogicallyHorizontal &&
    areGeometricallyAligned(startPoint, endPoint, 'horizontal')
  ) {
    return true;
  }

  return false;
}
