import type { ReactNode, CSSProperties, SVGProps } from 'react';
import type { PathStyle, TAnchorPosition } from './types';

export type ArrowStyle = {
  /**
   * Length of the arrowhead in pixels.
   */
  arrowLength?: number;

  /**
   * Color of the arrow line and head.
   */
  strokeColor?: string;

  /**
   * Width of the arrow line in pixels.
   */
  strokeWidth?: number;

  /**
   * Stroke dash array pattern for the arrow line. See SVG `stroke-dasharray`.
   * @example '5, 5' // Creates 5-unit dashes followed by 5-unit gaps.
   */
  strokeDasharray?: string;
};

// Use Required<> for properties that MUST have a default,
// exclude optional ones like strokeDasharray if its absence means "no dash"
export type ResolvedArrowStyle = Required<
  Pick<ArrowStyle, 'arrowLength' | 'strokeColor' | 'strokeWidth'>
> &
  Pick<ArrowStyle, 'strokeDasharray'>;
// This expands to:
// {
//   arrowLength: number;
//   strokeColor: string;
//   strokeWidth: number;
//   strokeDasharray?: string; // Remains optional as it is in ArrowStyle
// }

export type ArcherSurfaceProps = {
  /**
   * Default styles to apply to all arrows rendered within this surface.
   * These defaults can be overridden on a per-relation basis using the
   * `style` property in `SourceToTargetType`.
   *
   * @defaults { arrowLength: 16, strokeColor: 'gray', strokeWidth: 1 }
   */
  defaultArrowStyle?: ArrowStyle;

  /**
   * Additional props to pass directly to the underlying SVG element.
   * Useful for adding accessibility attributes, data attributes, or advanced
   * SVG settings.
   * @example { 'aria-hidden': true, 'data-testid': 'arrow-svg-canvas' }
   */
  svgElementProps?: SVGProps<SVGSVGElement>;

  /**
   * CSS styles to apply to the outermost container `div` of the ArcherSurface.
   */
  style?: CSSProperties;

  /**
   * CSS class name(s) to apply to the outermost container `div` of the
   * ArcherSurface.
   */
  className?: string;

  /**
   * CSS styles to apply to the inner `div` that wraps the `children`.
   * This is the element whose dimensions Archer uses for calculations.
   * Useful for layout adjustments of the content area within the surface.
   */
  surfaceStyle?: CSSProperties;

  /**
   * Optional callback function that gets invoked when the ArcherSurface
   * component unmounts.
   * Use this to clean up any external state related to the Archer setup (e.g.,
   * resetting Jotai atoms managed by the parent).
   */
  onSurfaceUnmount?: () => void;

  isMobile?: boolean;

  children: ReactNode;
};

export type EntityRelationType = {
  id: string;
  anchor: TAnchorPosition;
  optionalAnchor?: TAnchorPosition;

  /**
   * Defines the routing strategy for the arrow's path.
   * - 'smart': (Default) The arrow will use the full layout-aware logic to
   *   find an optimal path, avoiding obstacles and other elements.
   * - 'default': The arrow will bypass complex calculations and use the simplest
   *   possible path ('NO_LOOP' elbow), which is faster but not context-aware.
   */
  layout?: 'smart' | 'default';
  pathStyle?: PathStyle;

  /**
   * Opaque extension intent carried unchanged from public `Relation.meta` onto
   * the edge so the injected routing resolver and edge decorator can read it.
   * Archer never interprets it.
   */
  meta?: unknown;
};

export type SourceToTargetType = {
  source: EntityRelationType;
  target: EntityRelationType;
  label?: ReactNode;
  style?: ArrowStyle;
  // Computed at render-time, never stored upstream
  doubleHeaded?: boolean;
};
