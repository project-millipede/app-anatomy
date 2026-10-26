import { type TAnchorPosition } from '../types';

/**
 * Represents a unit vector aligned with the primary coordinate axes (X or Y),
 * indicating the direction pointing outwards from an anchor point. Useful for
 * calculating offsets strictly along the horizontal or vertical axis.
 */
type AxisVector = {
  /**
   * The component of the direction vector along the X-axis (-1, 0, or 1).
   */
  x: -1 | 1 | 0;
  /**
   * The component of the direction vector along the Y-axis (-1, 0, or 1).
   */
  y: -1 | 1 | 0;
};

/**
 * A mapping from TAnchorPosition to its corresponding axis-aligned outward vector.
 * Think of the component's coordinate system where:
 *  +X is Right (East)
 *  -X is Left (West)
 *  +Y is Down (South)  <-- Common in screen coordinates
 *  -Y is Up (North)    <-- Common in screen coordinates
 */
const ANCHOR_POSITION_TO_AXIS_VECTOR: Readonly<
  Record<TAnchorPosition, AxisVector>
> = {
  top: { x: 0, y: -1 }, // Points Up (North)
  bottom: { x: 0, y: 1 }, // Points Down (South)
  left: { x: -1, y: 0 }, // Points Left (West)
  right: { x: 1, y: 0 }, // Points Right(East)
};

// Define a default vector for invalid inputs or 'middle' if preferred
const DEFAULT_AXIS_VECTOR: Readonly<AxisVector> = { x: 0, y: 0 };

/**
 * Computes the axis-aligned unit vector pointing outwards from a given anchor
 * position. Returns a zero vector for 'middle' or if the position is
 * unrecognized.
 * @param anchorPosition The anchor position ('top', 'bottom', 'left', 'right', 'middle').
 * @returns The corresponding AxisVector.
 */
export const computeAnchorAxisVector = (
  anchorPosition: TAnchorPosition,
): AxisVector => {
  // Lookup the vector in the map. Fallback to default if not found.
  return ANCHOR_POSITION_TO_AXIS_VECTOR[anchorPosition] ?? DEFAULT_AXIS_VECTOR;
};
