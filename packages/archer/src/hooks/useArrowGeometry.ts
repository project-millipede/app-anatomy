import { type RefObject, useCallback, useEffect, useRef } from 'react';

import type { ArrowStyle, EntityRelationType } from '../types-private';
import {
  type InterContainerPathInstruction,
  type ObstructedUturnInstruction,
  type RoutingInstruction,
  type RoutingResolver,
  type SelfLoopInstruction,
  type ArcherRef,
  type SelfLoopRoutingStyle,
  type TAnchorPosition,
  SelfLoopRouting,
  IPoint,
  InterContainerElbowInstruction,
  InterContainerUTurnInstruction,
  LocalRelativeUturnInstruction,
  LocalRelativeElbowInstruction,
  TAxis,
} from '../types';

import { HooksUtils } from '../support';
import { CacheUtil } from '../support';

import {
  // getParentCoordinates,
  calculateLineEndPointForMarkerTip,
  computeArrowGeometry,
  getElementOrigin,
  getRelativeAnchorCoordinates,
} from '../utils/geometry';
import { Point } from '../utils/Point';
import {
  areGeometricallyAligned,
  areOpposingAnchors,
  isConnectionAxisConsistent,
  // isDirectNeighbor,
  isSameAxis,
} from './utils';
import { findClosestInContainer } from './dom-traversal';
import {
  calculateBoxPathParameters,
  determineInterContainerRoutingStrategy,
  determineInterContainerRoutingStrategyUsed,
  getVirtualContainerRect,
} from './inter-instance';
import { CalculationCache, LoopPathBoundaries } from './types';
import {
  getAdjacencyRelation,
  getAdjacencyRelationFromSelector,
  isDirectNeighbor,
} from './utils-with-cache';

/**
 * Decides which anchor position ('top', 'bottom', 'left', 'right') to use based
 * on whether the mobile layout is active and an optional anchor is provided.
 * Encapsulates the mobile override logic in one testable place.
 *
 * @param entity - The source or target entity description.
 * @param isMobile - Flag indicating if the mobile layout is active.
 * @returns The chosen TAnchorPosition.
 */
export function pickAnchor(
  { anchor, optionalAnchor }: EntityRelationType,
  isMobile: boolean,
): TAnchorPosition {
  // Use optionalAnchor on mobile if it exists, otherwise default to the primary anchor.
  return isMobile && optionalAnchor ? optionalAnchor : anchor;
}

/**
 * Represents the calculated geometry needed to render an arrow.
 */
export type ArrowGeometry = {
  /**
   * The SVG path data string (for the 'd' attribute).
   */
  path: string;
  /**
   * The calculated center coordinates {x, y} for placing the arrow's label.
   */
  label: { x: number; y: number };
};

type Params = {
  /**
   * Describes the source element (ID and anchor preferences).
   */
  source: EntityRelationType;
  /**
   * Describes the target element (ID and anchor preferences).
   */
  target: EntityRelationType;
  /**
   * An `ArcherRef` object containing the `RefObject` (`.ref`) pointing to the
   * source DOM element and potentially a `dynamicRef`. Should be stable.
   */
  sourceRef: ArcherRef;
  /**
   * An `ArcherRef` object containing the `RefObject` (`.ref`) pointing to the
   * target DOM element and potentially a `dynamicRef`. Should be stable.
   */
  targetRef: ArcherRef;
  /**
   * React RefObject pointing to the parent container element whose bounds
   * define the coordinate space. Should be stable.
   */
  parentRef: RefObject<Element | null>;
  /**
   * Flag indicating if the mobile layout variant should be used (affects anchor selection).
   */
  isMobile: boolean;

  loopStyle?: SelfLoopRoutingStyle;

  /**
   * Length of the arrowhead marker tip relative to its attachment point (refX=0).
   * Used for calculating the stroke trimming offset.
   * @default 10
   */
  arrowLength?: ArrowStyle['arrowLength'];
  /**
   * Width of the arrow's line (stroke).
   * Used for calculating the stroke trimming offset when markerUnits="strokeWidth".
   * @default 1
   */
  strokeWidth?: ArrowStyle['strokeWidth'];
  /**
   * If true, an arrowhead marker is assumed at the start, and the path's start point
   * will be trimmed accordingly.
   * @default false
   */
  doubleHeaded?: boolean;

  isSmartLayoutEnabled?: boolean;

  /**
   * Injected routing callback for this edge:
   *
   * 1. Returning a {@link RoutingInstruction} uses that instruction and skips the
   *    built-in router.
   * 2. Returning `null` delegates the edge to the built-in router.
   * 3. Omitting the callback also delegates the edge to the built-in router.
   *
   * @see {@link RoutingResolver}
   */
  resolveRouting?: RoutingResolver | null;
};

/**
 * Extracts the base element key from a full anchor ID.
 * This is used to determine if two anchors belong to the same logical element,
 * regardless of their specific anchor position ('top', 'left', etc.).
 *
 * @example
 * // returns 'my-element-1'
 * elementKey('my-element-1-anchor-top');
 *
 * @param fullAnchorId - The complete, unique identifier for an anchor point.
 * @returns The base key of the element.
 */
export const elementKey = (fullAnchorId: string): string => {
  const anchorSeparator = '-anchor-';
  const anchorIndex = fullAnchorId.lastIndexOf(anchorSeparator);

  // If the separator isn't found, return the original string.
  // Otherwise, return the part of the string before the separator.
  return anchorIndex === -1
    ? fullAnchorId
    : fullAnchorId.substring(0, anchorIndex);
};

/**
 * [REFACTORED & RENAMED]
 * Detects if a connection is a self-referencing loop on a single element and,
 * if so, returns the specific routing instruction required to draw the path.
 *
 * This function conforms to the standard detector pattern by returning a specific
 * instruction object on success and `null` on failure, eliminating the need
 * for special handling in the calling code.
 *
 * @returns A `SelfLoopInstruction` object if a valid self-loop is detected,
 *          otherwise returns `null`.
 */

function detectSelfLoopInstructionTest(
  sourceId: string,
  targetId: string,
  parentCoordinates: Point,
  loopStyle: SelfLoopRoutingStyle,
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
  containerElement: Element | null | undefined, // A more generic name here, as it's just one element
): SelfLoopInstruction | null {
  const isSelfLoop = elementKey(sourceId) === elementKey(targetId);
  const isSameAxisLoop = isSelfLoop && isSameAxis(sourceAnchor, targetAnchor);

  // If the conditions for a self-loop are not met, exit early.
  if (!isSameAxisLoop) {
    return null;
  }

  const isHorizontalConnection =
    sourceAnchor === 'left' || sourceAnchor === 'right';

  const loopAroundSide = isHorizontalConnection
    ? loopStyle === SelfLoopRouting.CLOCKWISE
      ? 'top'
      : 'bottom'
    : loopStyle === SelfLoopRouting.CLOCKWISE
      ? 'left'
      : 'right';

  // should be contained within this function
  // const containerElement = findClosestInContainer(
  //   sourceElement,
  //   '[data-archer-container]',
  //   boundaryElement
  // );

  if (!containerElement) {
    console.warn(
      `[Archer] A self-referencing arrow on "${elementKey(sourceId)}" could not be auto-routed because its container element with the 'data-archer-container' attribute was not found.`,
    );
    return null;
  }

  const point = getRelativeAnchorCoordinates(
    loopAroundSide,
    parentCoordinates,
    containerElement,
  );

  if (!point) {
    return null;
  }

  let finalValue: number;

  if (loopAroundSide === 'top' || loopAroundSide === 'left') {
    finalValue = (loopAroundSide === 'top' ? point.y : point.x) - PADDING;
  } else {
    // 'bottom' or 'right'
    finalValue = (loopAroundSide === 'bottom' ? point.y : point.x) + PADDING;
  }

  // This is the successful return path, which is unchanged.
  return isHorizontalConnection
    ? { type: 'HORIZONTAL_SELF_LOOP', y: finalValue }
    : { type: 'VERTICAL_SELF_LOOP', x: finalValue };
}

/**
 * [DEFINITIVE VERSION 3.0] Routes arrows between DIFFERENT containers based on a
 * strict, rule-based system.
 *
 * This function enforces a predictable routing strategy for all connections
 * that span across different `[data-archer-instance-id]` containers.
 *
 * --- ROUTING RULES ---
 *
 * 1.  Is the connection between different containers?
 *     - If NO, this function exits immediately (`undefined`). The path is handled
 *       by the default intra-container logic.
 *     - If YES, proceed to rule 2.
 *
 * 2.  Is the inter-container connection a direct VERTICAL crossing?
 *     (i.e., 'top' to 'bottom' or 'bottom' to 'top')
 *     - If YES, this is the SOLE EXCEPTION. The function exits (`undefined`),
 *       delegating to the default router to draw a simple, clean path. This
 *       correctly handles the "blue arrow" case.
 *     - If NO, proceed to rule 3.
 *
 * 3.  All other inter-container connections (including horizontal `left`/`right`
 *     and all same-side U-turns) are considered complex and MUST use the
 *     robust `INTER_CONTAINER_BOX` router for a controlled, predictable path.
 *     This correctly handles the "orange arrow" case.
 */

/**
 * [FINAL, DOCUMENTED, AND CORRECTED VERSION]
 * Determines the routing strategy for connections that span between two
 * different container elements.
 *
 * This version uses a clear, prioritized rule set and correctly distinguishes
 * between horizontal and vertical same-side connections to select the proper
 * pathing strategy (U-Turn vs. Box).
 */

/**
 * [FINAL, CORRECTED, AND SIMPLIFIED]
 *
 * This version implements a clear, prioritized rule set based on the key insight
 * that any inter-container connection involving a 'top' or 'bottom' anchor
 * MUST use the robust box router to guarantee obstacle avoidance.
 *
 * The logic is now:
 * 1. Is the connection purely horizontal? If so, apply specific elbow/U-turn logic.
 * 2. If the connection involves ANY vertical anchor, it MUST fall through to
 *    the robust `INTER_CONTAINER_BOX` router.
 */

/**
 * The "Coordinator" for inter-container routing.
 * This function orchestrates the process:
 * 1. Performs validation.
 * 2. Calls the "Strategizer" to get a strategy name.
 * 3. Executes the chosen strategy, calling calculators only when needed.
 */
function determineInterContainerPathTest(
  sourceId: string,
  targetId: string,
  sourceElement: Element,
  targetElement: Element,
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
  parentCoordinates: Point,
  sourceContainer: Element | null,
  targetContainer: Element | null,
  sourcePoint: IPoint,
  targetPoint: IPoint,
):
  | InterContainerPathInstruction
  | InterContainerElbowInstruction
  | InterContainerUTurnInstruction
  | null {
  // --- Step 1: Validation and Preparation ---
  if (
    !sourceContainer ||
    !targetContainer ||
    sourceContainer === targetContainer
  ) {
    return null;
  }

  if (!sourcePoint || !targetPoint) {
    console.error(
      '-> EXIT: Failed to get valid coordinates for source or target.',
    );
    return null;
  }

  // --- Step 2: Get the Routing Strategy from the "Strategizer" ---
  // TODO-OOO
  // const strategy = determineInterContainerRoutingStrategy(
  //   sourceAnchor,
  //   targetAnchor,
  //   sourcePoint,
  //   targetPoint
  // );

  const strategy = determineInterContainerRoutingStrategyUsed(
    sourceAnchor,
    targetAnchor,
    sourcePoint,
    targetPoint,
  );

  // --- Step 3: Act on the Strategy ---
  switch (strategy) {
    case 'INTER_CONTAINER_ELBOW':
      return { type: 'INTER_CONTAINER_ELBOW' };

    case 'INTER_CONTAINER_U_TURN':
      return { type: 'INTER_CONTAINER_U_TURN' };

    case 'INTER_CONTAINER_BOX': {
      // The coordinator calls the calculator DIRECTLY with the parameters it already has.
      const params = calculateBoxPathParameters(
        sourceElement,
        targetElement,
        sourceContainer,
        targetContainer,
        sourcePoint,
        sourceAnchor,
        parentCoordinates,
      );

      if (!params) {
        console.error('-> EXIT: Failed to calculate box path parameters.');
        return null;
      }

      return { type: 'INTER_CONTAINER_BOX', ...params };
    }
  }
}

/**
 * This function is a pure logical replica of the original working
 * `determineObstructedUturnTestWorkingReally` function.
 *
 * It takes pre-calculated data (including `loopPathBoundaries`) and applies the
 * exact same decision tree to determine the correct obstructed path type,
 * without performing any of its own DOM queries.
 *
 * @returns A specific routing instruction for an obstructed intra-container path.
 */

/**
 * Defines the preferred detour direction for wide, container-aware loops.
 */
export type DetourPreferences = {
  /** The side to use for detours around HORIZONTAL connections. Defaults to 'top'. */
  horizontal: 'top' | 'bottom';
  /** The side to use for detours around VERTICAL connections. Defaults to 'left'. */
  vertical: 'left' | 'right';
};

function calculateVectorAngle(source: IPoint, target: IPoint): number {
  const deltaY = target.y - source.y;
  const deltaX = target.x - target.y; // Corrected: should be target.x - source.x

  // Get the angle in radians and convert to degrees for easier reasoning.
  const angleInRadians = Math.atan2(deltaY, deltaX);
  return angleInRadians * (180 / Math.PI); // Returns a value from -180 to 180
}

/**
 * Calculates a preferred detour strategy based on the vector from a source
 * point to a target point.
 *
 * This acts as a dynamic heuristic to decide whether detours should go "over"
 * vs. "under" or "left" vs. "right" based on the general direction of the target.
 *
 * @param sourcePoint The starting coordinate.
 * @param targetPoint The ending coordinate.
 * @returns A DetourPreferences object with the suggested directions.
 */
function decideDetourStrategy(
  sourcePoint: IPoint,
  targetPoint: IPoint,
): DetourPreferences {
  const angle = calculateVectorAngle(sourcePoint, targetPoint);

  // Determine the preferred vertical detour ('top' or 'bottom').
  const horizontalDetourPreference = angle > 0 ? 'bottom' : 'top';

  // Determine the preferred horizontal detour ('left' or 'right').
  const verticalDetourPreference = angle > -90 && angle < 90 ? 'right' : 'left';

  return {
    horizontal: horizontalDetourPreference,
    vertical: verticalDetourPreference,
  };
}

// Axis for each anchor — removes need for nested ternaries.
const AXIS_FOR_ANCHOR: Record<TAnchorPosition, TAxis> = {
  left: 'horizontal',
  right: 'horizontal',
  top: 'vertical',
  bottom: 'vertical',
};

/**
 * Determines the correct routing instruction for an obstructed U-turn path between
 * two anchors inside the same container.
 *
 * This is a pure logical function that takes pre-calculated geometric data and
 * applies a decision tree to choose the optimal path type.
 *
 * @param detourPreferences (Optional) Specifies the preferred side for wide detours.
 * @returns A specific routing instruction object for the path.
 */
function determineObstructedUturnTestAlmostOriginalLikeButNeedsAddidtionalCheckWithOption(
  sourceAnchor: TAnchorPosition,
  targetAnchor: TAnchorPosition,
  sourcePoint: IPoint,
  targetPoint: IPoint,
  loopPathBoundaries: LoopPathBoundaries | undefined,
  loopBoundary: number,
  detourPreferences: DetourPreferences = {
    horizontal: 'top',
    vertical: 'left',
  },
):
  | ObstructedUturnInstruction
  | LocalRelativeUturnInstruction
  | LocalRelativeElbowInstruction {
  /**
   * 1. Bail out early when logical anchors are inconsistent.
   *    We defer to local‑relative instructions in that scenario.
   */
  const anchorsAreConsistent = isConnectionAxisConsistent(
    sourceAnchor,
    targetAnchor,
    sourcePoint,
    targetPoint,
  );

  /**
   * When anchors DON'T match their geometric reality:
   * - SAME axis      → rescue the route with a compact local U‑turn.
   * - DIFFERENT axes → fall back to a simple elbow.
   *
   * Real‑world example: on mobile the Dock ➜ Flow edge keeps right/left anchors
   * but Flow renders above Dock, so the logical anchors disagree with the
   * screen layout.
   */
  if (!anchorsAreConsistent) {
    if (isSameAxis(sourceAnchor, targetAnchor)) {
      return { type: 'LOCAL_RELATIVE_U_TURN' };
    }
    return { type: 'LOCAL_RELATIVE_ELBOW' };
  }

  /**
   * 2. From here we know the anchors are geometrically consistent.
   *    We still need boundary information—otherwise we cannot compute a safe loop.
   */
  if (!loopPathBoundaries) {
    console.warn(
      '[Archer] Missing loopPathBoundaries for a consistent obstructed path. Defaulting to elbow.',
    );
    return { type: 'LOCAL_RELATIVE_ELBOW' };
  }

  /**
   * 3. Helper derivations
   */
  const connectionAxis: TAxis = AXIS_FOR_ANCHOR[sourceAnchor];
  const crossAxis: TAxis =
    connectionAxis === 'horizontal' ? 'vertical' : 'horizontal';

  const isPerfectlyAligned = areGeometricallyAligned(
    sourcePoint, // { x, y }
    targetPoint, // { x, y }
    crossAxis, // 'vertical' → compare x’s,  'horizontal' → compare y’s
  );

  const isOpposing = areOpposingAnchors(sourceAnchor, targetAnchor);
  /**
   * 4. Wide U‑turn (box) — use detour preferences
   */
  if (isPerfectlyAligned || isOpposing) {
    const detourDirection: TAnchorPosition =
      connectionAxis === 'horizontal'
        ? detourPreferences.horizontal
        : detourPreferences.vertical;

    const detourBoundary = loopPathBoundaries[detourDirection];

    return {
      type: 'OBSTRUCTED_U_TURN_BOX',
      connectionSide: sourceAnchor,
      loopSide: detourDirection,
      // loopBoundary
      loopBoundary: detourBoundary,
    };
  }

  /**
   * 5. Tight U‑turn
   */
  return {
    type: 'OBSTRUCTED_U_TURN',
    connectionSide: sourceAnchor,
  };
}

/**
 * [FINAL, CORRECTED, AND COMPLETE]
 *
 * Determines the specific path for a connection between two anchors
 * on the SAME unit element. This function is a pure consumer of pre-calculated
 * data and has no DOM or cache dependencies. It correctly handles all four
 * scenarios: consistent opposing (box), consistent same-side (u-turn),
 * and the two inconsistent geometry fallbacks.
 *
 * @returns A specific routing instruction for an intra-unit path.
 */

const TURN_OUT_DISTANCE = 5.5;
const PADDING = TURN_OUT_DISTANCE;

/**
 * Recomputes the connector geometry whenever the layout changes.
 *
 * --- EXECUTION FLOW ---
 *
 * 1. Pre-flight            – Verify refs and obtain parent offset.
 * 2. Anchor Selection      – Choose logical sides ('top', 'left', etc.) for
 *                            both source and target, considering mobile
 *                            overrides.
 * 3. Anchor Coordinates    – Convert the logical anchor sides into absolute
 *                            (x,y) coordinates in the diagram's space.
 * 4. Stroke Trimming       – Calculate the final start and end points for the
 *                            visible path by pulling them back to accommodate
 *                            the size of the arrowhead markers.
 * 5. Geometry Computation  – Delegate all remaining logic (path calculation,
 *                            label positioning) to a single, powerful utility
 *                            function.
 * 6. Return                – Provide the final `ArrowGeometry` object
 *                            containing the SVG path string and label
 *                            coordinates.
 */
export function useArrowGeometry({
  source,
  target,
  sourceRef,
  targetRef,
  parentRef,
  isMobile,
  loopStyle = SelfLoopRouting.CLOCKWISE,
  arrowLength = 10,
  strokeWidth = 1,
  doubleHeaded = false,
  isSmartLayoutEnabled = true,
  resolveRouting = null,
}: Params): (measure?: boolean) => ArrowGeometry | null {
  const calculationCache = useRef<CalculationCache | null>(null);

  useEffect(() => {
    return () => {
      // Clear the previous calculation cache after React commits new endpoint ids,
      // and also when the arrow unmounts.
      CacheUtil.invalidateCache(calculationCache);
    };
  }, [source.id, target.id]);

  // Inside your SvgArrow component or a relevant hook
  const previousPathRef = useRef<IPoint[] | null>(null);

  // If the arrow targets change, reset the logger's memory.
  useEffect(() => {
    previousPathRef.current = null;
  }, [source.id, target.id]);

  /**
   * Memoized function that performs the geometry calculation.
   * This is the core logic returned by the hook.
   */
  const calculateGeometry = useCallback(
    (measure: boolean = false): ArrowGeometry | null => {
      /**
       * 1. Resolve and Validate All Required DOM Elements
       *
       * This block serves as the primary pre-flight check. Its logic is as
       * follows:
       * 1. It resolves the `parentRef`, `sourceRef`, and `targetRef` objects to
       *    their current DOM elements.
       * 2. It performs a guard check to ensure all three elements are available.
       * 3. If any element is missing (e.g., not yet rendered), the function exits
       *    early to prevent runtime errors.
       *
       * After this block, the `parentElement`, `sourceElement`, and
       * `targetElement` variables are guaranteed to be valid `Element` objects.
       */

      const parentElement = parentRef.current;
      const sourceElement = sourceRef?.ref?.current;
      const targetElement = targetRef?.ref?.current;

      if (!parentElement || !sourceElement || !targetElement) {
        // If any element is missing, geometry calculation is impossible.
        return null;
      }
      if (
        !sourceElement.getClientRects().length ||
        !targetElement.getClientRects().length
      ) {
        return null;
      }

      /**
       * 2. Calculate Relative Anchor Coordinates
       *
       * With the DOM elements validated, this block computes the precise (x, y)
       * points on the source and target elements where the arrow will connect.
       * This involves a multi-step calculation for both the source and target:
       * 1. The parent container's origin is established as the reference point
       *    for all relative calculations.
       * 2. The logical anchor position (e.g., 'top', 'right') is selected,
       *    accounting for mobile-specific overrides.
       * 3. These inputs are then used to calculate the final coordinates relative
       *    to the parent container.
       *
       * The result of this block is two `Point` objects ready for the routing
       * logic.
       */

      // this can not be memoized, unclear why
      const parentCoordinates = getElementOrigin(parentElement);

      const sourceAnchorPositionChosen = pickAnchor(source, isMobile);
      const targetAnchorPositionChosen = pickAnchor(target, isMobile);

      const sourceAnchorPoint = getRelativeAnchorCoordinates(
        sourceAnchorPositionChosen,
        parentCoordinates,
        sourceElement,
      );

      const targetAnchorPoint = getRelativeAnchorCoordinates(
        targetAnchorPositionChosen,
        parentCoordinates,
        targetElement,
      );

      if (!sourceAnchorPoint || !targetAnchorPoint) return null;

      /* -------------------------------------------------------------------------- */
      /*  2½.  Resolve the instance elements (one lookup, cached immutably)         */
      /* -------------------------------------------------------------------------- */

      /**
       * The instance elements are the closest ancestors that carry
       * `[data-archer-instance-id]`. Because this lookup is expensive,
       * each result is cached in `calculationCache` under a stable key for its
       * arrow end.
       *
       * These calls omit `forceRecalc`, so `calculateGeometry(true)` still reuses
       * the cached ancestor elements.
       */
      const sourceContainer = CacheUtil.getFromCacheOrCalculate(
        calculationCache,
        'sourceInstanceElement',
        () => {
          return findClosestInContainer(
            sourceElement,
            '[data-archer-instance-id]',
            parentElement,
          );
        },
      );

      const targetContainer = CacheUtil.getFromCacheOrCalculate(
        calculationCache,
        'targetInstanceElement',
        () => {
          return findClosestInContainer(
            targetElement,
            '[data-archer-instance-id]',
            parentElement,
          );
        },
      );

      /**
       * Stores the final resolver-or-built-in routing instruction.
       *
       * 1. On recalculation, `resolveRouting` receives `source.meta` before the
       *    built-in fallback runs.
       * 2. Ordinary imperative and animation calculations reuse the cached
       *    instruction while anchor coordinates continue to be measured.
       * 3. `measure=true` recalculates and replaces the cached instruction.
       */
      const layoutInstruction = CacheUtil.getFromCacheOrCalculate(
        calculationCache,
        'layoutInstruction',
        () => {
          /**
           * 3. Routing Decision Logic
           *
           * This is the core "brain" of the arrow, which determines the final
           * `layoutInstruction` to be used for path building.
           */
          let layoutInstruction: RoutingInstruction | null = null;

          /**
           * STEP 0 — Injected policy first.
           * Ask the consumer's resolver how to route this edge. A non-null
           * result is the final decision; `null` means it declines and we fall
           * through to the built-in router below.
           */
          if (resolveRouting) {
            layoutInstruction = resolveRouting({
              sourceId: source.id,
              targetId: target.id,
              meta: source.meta,
            });
          }

          /**
           * STEP 1 — Built-in smart router, AS FALLBACK ONLY.  ← critical line
           *
           * The `!layoutInstruction` guard is load-bearing: the default router
           * runs *only* when policy stayed silent (resolver returned `null` or
           * was absent). This makes the resolver a non-destructive override and
           * leaves every existing edge unchanged when no policy is injected.
           *
           * Short-circuiting this block is SAFE because its *only* output is
           * `layoutInstruction` (it is the body of a cache calculator that
           * returns exactly that); nothing downstream — start/end points, the
           * path builder, the markers — reads its internal scratch work.
           */
          if (!layoutInstruction && isSmartLayoutEnabled) {
            // --- Use our immutable caching helper to get the adjacency status ---
            const adjacency = CacheUtil.getFromCacheOrCalculate(
              calculationCache,
              'adjacency',
              () => {
                // This expensive DOM query only runs if the cache is empty.
                return getAdjacencyRelationFromSelector(
                  sourceElement,
                  targetElement,
                );
              },
            );

            if (
              isDirectNeighbor(
                adjacency,
                sourceAnchorPoint,
                targetAnchorPoint,
                sourceAnchorPositionChosen,
                targetAnchorPositionChosen,
              )
            ) {
              layoutInstruction = { type: 'STRAIGHT_LINE' };
            }

            // Rule 2: Is it a self-referencing loop on a single element?
            if (!layoutInstruction) {
              // Get or calculate the unit elements ONCE
              const sourceUnitElement = CacheUtil.getFromCacheOrCalculate(
                calculationCache,
                'sourceUnitElement',
                () => {
                  return findClosestInContainer(
                    sourceElement,
                    '[data-archer-id]',
                    parentElement,
                  );
                },
              );

              layoutInstruction = detectSelfLoopInstructionTest(
                source.id,
                target.id,
                parentCoordinates,
                loopStyle,
                sourceAnchorPositionChosen,
                targetAnchorPositionChosen,
                sourceUnitElement,
              );
            }

            // Rule 3: Is it an obstructed path within the same container?
            if (!layoutInstruction) {
              const sourceUnitElement = CacheUtil.getFromCacheOrCalculate(
                calculationCache,
                'sourceUnitElement',
                () => {
                  return findClosestInContainer(
                    sourceElement,
                    '[data-archer-id]',
                    parentElement,
                  );
                },
              );
              const targetUnitElement = CacheUtil.getFromCacheOrCalculate(
                calculationCache,
                'targetUnitElement',
                () => {
                  return findClosestInContainer(
                    targetElement,
                    '[data-archer-id]',
                    parentElement,
                  );
                },
              );

              const isObstructedIntraContainer =
                sourceUnitElement &&
                targetUnitElement &&
                sourceUnitElement !== targetUnitElement &&
                sourceContainer &&
                sourceContainer === targetContainer;

              if (!layoutInstruction && isObstructedIntraContainer) {
                // const loopBoundary = getFromCacheOrCalculate(
                //   calculationCache,
                //   'loopBoundary',
                //   () => {
                //     const isHorizontalConnection =
                //       sourceAnchorPositionChosen === 'left' ||
                //       sourceAnchorPositionChosen === 'right';

                //     const loopSide: TAnchorPosition = isHorizontalConnection
                //       ? 'top'
                //       : 'left';

                //     const anchorPoint = getRelativeAnchorCoordinates(
                //       loopSide,
                //       parentCoordinates,
                //       sourceContainer
                //     );

                //     if (!anchorPoint) return;

                //     const loopBoundary =
                //       loopSide === 'top' || loopSide === 'left'
                //         ? (loopSide === 'top' ? anchorPoint.y : anchorPoint.x) -
                //           PADDING
                //         : (loopSide === 'bottom' ? anchorPoint.y : anchorPoint.x) +
                //           PADDING;

                //     return loopBoundary;
                //   },
                //   measure
                // );

                const loopPathBoundaries = CacheUtil.getFromCacheOrCalculate(
                  calculationCache,
                  'loopPathBoundaries',
                  () => {
                    // *** THE CRITICAL FIX ***
                    // Calculate the boundary based on the a`sourceUnitElement`, NOT the container.
                    const rect = sourceUnitElement.getBoundingClientRect();

                    return {
                      top: rect.top - PADDING - parentCoordinates.y,
                      bottom: rect.bottom + PADDING - parentCoordinates.y,
                      left: rect.left - PADDING - parentCoordinates.x,
                      right: rect.right + PADDING - parentCoordinates.x,
                    };
                  },
                  measure,
                );

                // does not need sourceContainer && sourceContainer === targetContainer;
                // layoutInstruction = determineObstructedUturnTestWorkingReally(
                //   source.id,
                //   target.id,
                //   parentCoordinates,
                //   sourceContainer,
                //   targetContainer,
                //   sourceAnchorPoint,
                //   targetAnchorPoint,
                //   sourceAnchorPositionChosen,
                //   targetAnchorPositionChosen
                // );

                // needs sourceContainer && sourceContainer === targetContainer;
                layoutInstruction =
                  determineObstructedUturnTestAlmostOriginalLikeButNeedsAddidtionalCheckWithOption(
                    sourceAnchorPositionChosen,
                    targetAnchorPositionChosen,
                    sourceAnchorPoint,
                    targetAnchorPoint,
                    loopPathBoundaries,
                    // loopBoundary
                    0,
                    {
                      horizontal: 'top',
                      vertical: 'right',
                    },
                  );
              }
            }

            const instanceAdjacency = CacheUtil.getFromCacheOrCalculate(
              calculationCache,
              'instanceAdjacency',
              () => {
                // This expensive DOM query only runs if the cache is empty.
                return getAdjacencyRelation(sourceContainer, targetContainer);
              },
            );

            // Rule 4: Is it a path between two different containers?
            // if (
            //   !layoutInstruction &&
            //   (instanceAdjacency === 'next' || instanceAdjacency === 'previous')
            // ) {

            if (!layoutInstruction) {
              layoutInstruction = determineInterContainerPathTest(
                source.id,
                target.id,
                sourceElement,
                targetElement,
                sourceAnchorPositionChosen,
                targetAnchorPositionChosen,
                parentCoordinates,
                // distance among containers is there one intermediate container?
                sourceContainer,
                targetContainer,
                sourceAnchorPoint,
                targetAnchorPoint,
              );
            }
          }

          /**
           * 4. Final Fallback
           * If after all the smart logic (or if it was disabled), we still have no
           * specific instruction, we apply the ultimate default.
           */
          if (!layoutInstruction) {
            layoutInstruction = { type: 'NO_LOOP' };
          }

          return layoutInstruction;
        },
        measure,
      );

      // console.log('hook level layoutInstruction: ', layoutInstruction);

      /**
       * 5. Stroke Trimming
       *
       * SVG’s <marker> mechanism attaches the marker graphic so that the path’s
       * *final vertex* coincides with *refX = 0* inside the marker’s viewBox.
       * The *visual* tip of most arrowheads, however, is drawn at *+arrowLength*
       * on that local X-axis.
       *
       * To make the tip land exactly on our anchor we must therefore move the
       * vertex *backwards* along the anchor’s outward axis by:
       *
       *     Δ = arrowLength × strokeWidth   (when `markerUnits="strokeWidth"`)
       *     Δ = arrowLength                 (when `markerUnits="userSpaceOnUse"`)
       *
       * If `doubleHeaded` is *false* we leave the *start* vertex untouched and
       * trim only the *end*; otherwise we trim both ends symmetrically.
       */

      // Start vertex — trimmed only when we plan to draw markerStart
      const startPointForPath = doubleHeaded
        ? calculateLineEndPointForMarkerTip(
            sourceAnchorPoint,
            arrowLength,
            strokeWidth,
            sourceAnchorPositionChosen,
          )
        : sourceAnchorPoint;

      // End vertex — always trimmed because markerEnd is always present
      const endPointForPath = calculateLineEndPointForMarkerTip(
        targetAnchorPoint,
        arrowLength,
        strokeWidth,
        targetAnchorPositionChosen,
      );

      /**
       * 5. Geometry Computation
       *    Delegate all complex path and label positioning logic to the
       *    `computeArrowGeometry` utility. It will automatically select the best
       *    path style (sharp for same-side, smooth for mixed-side) and return the
       *    complete geometry object.
       */
      return computeArrowGeometry(
        startPointForPath,
        endPointForPath,
        sourceAnchorPositionChosen,
        targetAnchorPositionChosen,
        layoutInstruction ?? { type: 'NO_LOOP' },
        previousPathRef,
        source.pathStyle,
      );
    },
    [
      // Refs (include the objects themselves, not .ref or .current)
      sourceRef,
      targetRef,
      parentRef,
      // Static routing inputs intentionally omitted from this dependency list:
      // `resolveRouting` and `source.meta`.
      // --- Source Entity Data ---
      source.id,
      source.anchor,
      source.optionalAnchor,
      source.pathStyle,
      source.meta,
      resolveRouting,
      // --- Target Entity Data ---
      target.id,
      target.anchor,
      target.optionalAnchor,
      // --- Style & Configuration ---
      isMobile,
      arrowLength,
      strokeWidth,
      doubleHeaded,
      isSmartLayoutEnabled,
    ],
  );

  // Return the memoized calculation function to the consuming component.
  return calculateGeometry;
}
