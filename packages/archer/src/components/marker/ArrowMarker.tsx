import { type FC, useMemo } from 'react';
import { getArrowMarkerAttributesAndElement } from './arrowMarkerUtils';

export type ArrowVariant = 'path' | 'polygon';

type ArrowMarkerProps = {
  /**
   * Unique identifier for the marker. Used for referencing in SVG.
   */
  id: string;
  /**
   * The "width" of the arrow marker's drawing area.
   * This directly influences the markerWidth of the SVG marker.
   * @default 12
   */
  arrowLength?: number;
  /**
   * The ratio of the arrow's height to its width (arrowLength).
   * Height = arrowLength * ratio.
   * @default 0.5
   */
  ratio?: number;
  /**
   * Fill color for the arrow.
   * @default 'black'
   */
  fill?: string;
  /**
   * The SVG element type to use for drawing the arrow.
   * @default 'path'
   */
  variant?: ArrowVariant;
};

/**
 * A React component that renders an SVG `<marker>` element suitable for use as
 * an arrowhead on lines, paths, or polylines. The marker's shape is a triangle.
 */
export const ArrowMarker: FC<ArrowMarkerProps> = ({
  id,
  arrowLength = 12,
  ratio = 0.5,
  fill = 'black',
  variant,
}) => {
  const { viewBox, markerWidth, markerHeight, refX, refY, arrowElement } =
    useMemo(() => {
      return getArrowMarkerAttributesAndElement(
        arrowLength,
        ratio,
        fill,
        variant,
      );
    }, [arrowLength, ratio, fill, variant, id]);

  return (
    <marker
      id={id}
      key={id}
      viewBox={viewBox}
      markerWidth={markerWidth}
      markerHeight={markerHeight}
      markerUnits="strokeWidth" // Makes the marker scale with the stroke width of the path it's on
      orient="auto-start-reverse" // Orients the arrow correctly at the start of a line, pointing outwards
      refX={refX} // Attaches the base of the arrow to the line
      refY={refY} // Centers the base of the arrow vertically on the line
    >
      {/* Optional: Debugging rectangle to visualize the viewBox boundaries */}
      {/* <rect x={0} y={0} width={markerWidth} height={markerHeight} fill='rgba(200,200,200,0.3)' /> */}
      {arrowElement} {/* Renders the chosen <path> or <polygon> element */}
      {/* Optional: Debugging circle to visualize the refX/refY attachment point */}
      {/* <circle cx={refX} cy={refY} r={0.5} fill='red' pointerEvents='none' /> */}
    </marker>
  );
};
