import type { ReactNode, RefObject } from 'react';

/**
 * Public API exposed through `dynamicRef`.
 */
export type EdgeLabelSyncHandle = {
  /**
   * Imperatively move the label’s visual centre to (`x`, `y`) in surface
   * coordinates. Skips a React re-render by mutating the underlying DOM
   * transform directly.
   */
  updatePosition(x: number, y: number): void;
};

/**
 * Props shared by both the SVG and portal-DOM label implementations.
 */
export interface EdgeLabelProps {
  /**
   * X-coordinate of the label’s centre in surface space (pixels).
   */
  x: number;
  /**
   * Y-coordinate of the label’s centre in surface space (pixels).
   */
  y: number;

  /**
   * Background colour for the label’s capsule. `null` means fully transparent.
   */
  rectFill?: string | null;

  /**
   * Invoked when the user clicks the label.
   */
  onLabelClick?: () => void;

  /**
   * Ref that receives the {@link EdgeLabelSyncHandle}.
   * Use it to animate the label from outside React’s render cycle.
   */
  dynamicRef: RefObject<EdgeLabelSyncHandle | null> | null;

  /**
   * Any element inside the surface (typically the content wrapper). We locate
   * the overlay by inspecting `surfaceContentRef.current.parentElement`.
   */
  surfaceContentRef?: RefObject<Element | null>;

  /**
   * React children rendered inside the label.
   */
  children: ReactNode;
}
