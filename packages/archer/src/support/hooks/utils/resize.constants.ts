/**
 * Represents the sides used for calculating vertical margins.
 */
export const VerticalMargin = ['top', 'bottom'] as const;

/**
 * Represents the sides used for calculating horizontal margins.
 */
export const HorizontalMargin = ['left', 'right'] as const;

/**
 * Defines the different ways dimensions can be measured by useResize.
 */
export const Dimension = {
  /**
   * Measure height including padding, border, and vertical margins.
   */
  measureHeight: 'measureHeight',
  /**
   * Measure width including padding, border, and horizontal margins.
   */
  measureWidth: 'measureWidth',
  /**
   * Measure both height and width including padding, border, and their respective margins.
   */
  measureBothWithMargins: 'measureBothWithMargins',
} as const;

/**
 * Type representing one of the dimension measurement strategies.
 */
export type TDimension = (typeof Dimension)[keyof typeof Dimension];

/**
 * Type for the state object holding the calculated dimensions.
 * Uses optional properties as initial state might be undefined.
 */
export type MeasuredDimensions = {
  width: number;
  height: number;
};

/**
 * Type for the object holding calculated margin values.
 */
export type CalculatedMargins = {
  /**
   * Sum of top and bottom margins.
   */
  marginTopBottom: number;
  /**
   * Sum of left and right margins.
   */
  marginLeftRight: number;
};
