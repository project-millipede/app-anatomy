import { JSX } from 'react';
import { ArrowVariant } from './ArrowMarker';

/**
 * A simple 2D point.
 */
type Point = { x: number; y: number };

/**
 * Base type for common SVG marker attributes.
 * These are directly used by the `<marker>` SVG element.
 */
type BaseSvgMarkerAttributes = {
  /**
   * SVG viewBox string, e.g., "0 0 width height".
   * Defines the marker's internal coordinate system.
   */
  viewBox: string;
  /**
   * Width for the SVG marker element.
   * Determines how much space the marker occupies.
   */
  markerWidth: number;
  /**
   * Height for the SVG marker element.
   */
  markerHeight: number;
  /**
   * X-coordinate of the marker's reference point (where it attaches to the line
   * being marked).
   */
  refX: number;
  /**
   * Y-coordinate of the marker's reference point.
   */
  refY: number;
};

/**
 * Geometry information specific to rendering an arrow as an SVG <path>.
 * Extends `BaseSvgMarkerAttributes` with the path data string.
 */
type ArrowPathData = BaseSvgMarkerAttributes & {
  /**
   * SVG path 'd' attribute string defining the arrow shape.
   */
  path: string;
};

/**
 * Geometry information specific to rendering an arrow as an SVG <polygon>.
 * Extends `BaseSvgMarkerAttributes` with the points data string.
 */
type ArrowPolygonData = BaseSvgMarkerAttributes & {
  /**
   * SVG polygon 'points' attribute string defining the arrow shape.
   */
  points: string;
};

/**
 * Data structure returned by `getArrowMarkerAttributesAndElement`.
 * Includes common SVG marker attributes and the fully constructed JSX for the arrow shape.
 */
type ArrowMarkerLayoutData = BaseSvgMarkerAttributes & {
  /**
   * The JSX element (either <path> or <polygon>) representing the arrow.
   */
  arrowElement: JSX.Element;
};

/**
 * Internal type for the raw dimensions and vertices calculated by `_calculateArrowBaseGeometry`.
 * This is a precursor to the more specific geometry types.
 */
type ArrowRawDimensions = {
  /**
   * Calculated width of the arrow, same as input `arrowLength`.
   */
  width: number;
  /**
   * Calculated height of the arrow (width * ratio).
   */
  height: number;
  /**
   * Array of three points [tip, baseTop, baseBottom] defining the triangle's vertices.
   */
  vertices: [Point, Point, Point];
  /**
   * SVG viewBox string, e.g., "0 0 width height".
   */
  viewBox: string;
  /**
   * X-coordinate of the marker's reference point.
   */
  refX: number;
  /**
   * Y-coordinate of the marker's reference point.
   */
  refY: number;
};

/**
 * Calculates common dimensions and vertices for an arrow triangle.
 * This function is NOT independently memoized; its re-execution is controlled
 * by how its callers are memoized (e.g., via React.useMemo in the component).
 *
 * The arrow is designed with its base along the Y-axis (at x=0) and its tip
 * pointing towards the positive X-axis (at x=arrowLength).
 * The reference point (refX, refY) for SVG marker attachment is set to the
 * center of the arrow's base.
 *
 * Visual representation within the marker's viewBox (`0 0 width height`):
 *
 *          Y-axis ^
 *                 |
 * (0, height) BT +
 *                 |\
 *                 | \
 *                 |  \
 *   (0, halfH)    X----* TIP (width, halfH)  <-- 'X' is the REF point
 *                 |  /
 *                 | /
 *                 |/
 *     (0,0) BB +-------------------> X-axis
 *      (viewBox origin)
 *
 * Key Points in the Diagram:
 *   - BT: BaseTop vertex (0, height)
 *   - BB: BaseBottom vertex (0, 0) - This is the origin of the viewBox.
 *   - TIP: Tip vertex (width, halfHeight)
 *   - X (REF): The reference point (refX, refY) for path attachment,
 *              calculated as (0, halfHeight). This point is at the
 *              vertical center of the arrow's base (the line segment BB-BT).
 *
 * The arrow's base is the vertical line segment from BB to BT (along the Y-axis, at x=0).
 * The viewBox for the marker starts at (0,0) [BB] and has dimensions `width` and `height`.
 *
 * @param arrowLength The desired width of the arrow's bounding box (markerWidth).
 * @param ratio The ratio of height to width (height = arrowLength * ratio).
 * @returns An `ArrowRawDimensions` object containing calculated width, height, vertices,
 *          viewBox string, and reference points (refX, refY).
 */

function _calculateArrowBaseGeometry(
  arrowLength: number,
  ratio: number,
): ArrowRawDimensions {
  const width = arrowLength; // This will be markerWidth
  const height = width * ratio; // This will be markerHeight
  const halfHeight = height / 2;

  // Define the three vertices of the triangle
  const tip: Point = { x: width, y: halfHeight }; // Tip of the arrow
  const baseTop: Point = { x: 0, y: height }; // Top-left of the arrow's base
  const baseBottom: Point = { x: 0, y: 0 }; // Bottom-left of the arrow's base

  // Store vertices in a specific order: [tip, baseTop, baseBottom]
  const vertices: [Point, Point, Point] = [tip, baseTop, baseBottom];

  // The viewBox defines the coordinate system within the marker
  const viewBox = `0 0 ${width} ${height}`;

  /**
   * The `refX` and `refY` attributes for an SVG marker define a point within
   * the marker's own viewBox. This point is what aligns with the vertex of the
   * path (or line end) to which the marker is applied. See the diagram arrow's
   * geometry and reference point.
   */

  /**
   * refX = 0: The horizontal coordinate for the marker's attachment point.
   * This value (0) aligns the attachment with the marker's local x=0
   * coordinate. As shown in the diagram, this corresponds to the arrow's base
   * line, causing the base of the arrow to connect directly to the path's
   * vertex.
   */
  const refX = 0;

  /**
   * refY = halfHeight: The vertical coordinate for the marker's attachment
   * point.
   * This value (`height` / 2) aligns the attachment with the marker's local
   * y=`halfHeight` coordinate. This places the attachment at the vertical
   * midpoint of the arrow's base, as indicated by the 'X' (REF point) in the
   * diagram.
   */
  const refY = halfHeight;

  return { width, height, vertices, viewBox, refX, refY };
}

/**
 * Calculates geometry specifically for rendering an arrow using an SVG <path> element.
 * It uses `_calculateArrowBaseGeometry` for common calculations and then formats
 * the vertices into an SVG path string.
 *
 * @param arrowLength The desired width of the arrow's bounding box.
 * @param ratio The ratio of height to width. Defaults to 0.5.
 * @returns An `ArrowPathData` object containing the SVG path string ('d' attribute),
 *          viewBox, marker dimensions, and reference points.
 */
function makeArrowPathGeometry(
  arrowLength: number,
  ratio = 0.5,
): ArrowPathData {
  const { width, height, vertices, viewBox, refX, refY } =
    _calculateArrowBaseGeometry(arrowLength, ratio);

  // Destructure vertices for clarity in path construction.
  const [tip, baseTop, baseBottom] = vertices;

  /**
   * Construct the SVG path 'd' attribute:
   * M = Move to (absolute coordinates) the tip of the arrow.
   * L = Line to (absolute coordinates) the top-left of the base.
   * L = Line to (absolute coordinates) the bottom-left of the base.
   * Z = Close path (draws a line back to the starting point - the tip).
   */
  const path = `M ${tip.x} ${tip.y} L ${baseTop.x} ${baseTop.y} L ${baseBottom.x} ${baseBottom.y} Z`;

  return {
    path,
    viewBox,
    markerWidth: width,
    markerHeight: height,
    refX,
    refY,
  };
}

/**
 * Calculates geometry specifically for rendering an arrow using an SVG <polygon> element.
 * It uses `_calculateArrowBaseGeometry` for common calculations and then formats
 * the vertices into an SVG points string.
 *
 * @param arrowLength The desired width of the arrow's bounding box.
 * @param ratio The ratio of height to width. Defaults to 0.5.
 * @returns An `ArrowPolygonData` object containing the SVG points string,
 *          viewBox, marker dimensions, and reference points.
 */
function makeArrowPolygonGeometry(
  arrowLength: number,
  ratio = 0.5,
): ArrowPolygonData {
  const { width, height, vertices, viewBox, refX, refY } =
    _calculateArrowBaseGeometry(arrowLength, ratio);

  /**
   * The `vertices` array contains three Point objects: [tip, baseTop, baseBottom].
   * The .map() function iterates over each Point object (p) in the `vertices` array.
   * For each point, it creates a string "x,y" (e.g., "12,3").
   * The .join(' ') then concatenates these strings with a space separator,
   * forming the 'points' attribute string, e.g., "12,3 0,6 0,0".
   * This is the required format for the SVG <polygon> 'points' attribute.
   */
  const pointsString = vertices.map((p) => `${p.x},${p.y}`).join(' ');

  return {
    points: pointsString,
    viewBox,
    markerWidth: width,
    markerHeight: height,
    refX,
    refY,
  };
}

/**
 * Generates all necessary attributes for the SVG `<marker>` element
 * and the inner arrow shape element (<path> or <polygon>).
 * This function centralizes the logic for choosing the correct geometry function
 * and constructing the arrow's visual element based on the `variant`.
 *
 * @param arrowLength The width of the arrow.
 * @param ratio The height-to-width ratio of the arrow.
 * @param fill The fill color for the arrow shape.
 * @param variant The type of SVG element to use for the arrow ('path' or 'polygon').
 * @returns An `ArrowMarkerLayoutData` object containing all attributes
 *          for the `<marker>` tag and the `arrowElement` JSX.
 */
export function getArrowMarkerAttributesAndElement(
  arrowLength: number,
  ratio: number,
  fill: string,
  variant: ArrowVariant = 'polygon',
): ArrowMarkerLayoutData {
  if (variant === 'path') {
    const { path, ...baseAttributes } = makeArrowPathGeometry(
      arrowLength,
      ratio,
    );
    return {
      ...baseAttributes,
      arrowElement: (
        <path d={path} fill={fill} vectorEffect="non-scaling-stroke" />
      ),
    };
  }
  const { points, ...baseAttributes } = makeArrowPolygonGeometry(
    arrowLength,
    ratio,
  );
  return {
    ...baseAttributes,
    arrowElement: <polygon points={points} fill={fill} />,
  };
}
