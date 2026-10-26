import {
  VerticalMargin,
  HorizontalMargin,
  Dimension,
  TDimension,
  MeasuredDimensions,
  CalculatedMargins,
} from './resize.constants';
import { hasBorderBox } from './validation';

/**
 * Calculates total vertical (top + bottom) and horizontal (left + right)
 * margins from a `CSSStyleDeclaration` object.
 *
 * Process:
 * 1. Retrieves `margin-top/bottom/left/right` strings via
 *    `style.getPropertyValue()`.
 * 2. Parses values with `parseFloat()`, defaulting non-numeric (e.g., 'auto') to 0.
 * 3. Sums the parsed vertical and horizontal margins respectively.
 *
 * Note on `CSSStyleDeclaration` and `getPropertyValue()`:
 * The `style` object is typically obtained from
 * `window.getComputedStyle(element)`. Calling `window.getComputedStyle()` is
 * the step where the browser actively resolves all CSS rules and computes the
 * final values for all properties of the element, creating a snapshot.
 * Subsequent calls on this snapshot object (e.g.,
 * `style.getPropertyValue("margin-top")`) are then fast lookups into these
 * pre-computed values. They do not trigger new style computations or layout
 * flushes by the browser.
 *
 * @param style The `CSSStyleDeclaration` snapshot of computed styles.
 * @returns An object `{ marginTopBottom: number, marginLeftRight: number }`
 *          with summed margins.`
 */
const getMarginsFromStyle = (style: CSSStyleDeclaration): CalculatedMargins => {
  const marginTopBottom = VerticalMargin.map(
    (side) => parseFloat(style.getPropertyValue(`margin-${side}`)) || 0,
  ).reduce((sum, margin) => sum + margin, 0);

  const marginLeftRight = HorizontalMargin.map(
    (side) => parseFloat(style.getPropertyValue(`margin-${side}`)) || 0,
  ).reduce((sum, margin) => sum + margin, 0);

  return { marginTopBottom, marginLeftRight };
};

/**
 * Adjusts raw element dimensions (which include padding and border) by
 * selectively adding pre-calculated margins based on a specified measurement
 * strategy.
 *
 * This allows for calculating the total space an element might occupy,
 * including its margins, if required by the `dimension` strategy.
 *
 * @param rawWidth  The element's width including padding and border (border-box).
 *                  Typically from `ResizeObserverEntry.borderBoxSize` or
 *                  `getBoundingClientRect()`.
 * @param rawHeight The element's height including padding and border (border-box).
 * @param margins   An object with pre-calculated `marginTopBottom` and
 *                  `marginLeftRight` values.
 * @param dimension The strategy (`TDimension`) that dictates how margins are applied:
 *                  - `Dimension.measureWidth`: Adds horizontal margins to `rawWidth`.
 *                  - `Dimension.measureHeight`: Adds vertical margins to `rawHeight`.
 *                  - `Dimension.measureBothWithMargins`: Adds both horizontal and
 *                    vertical margins.
 *                  - If `undefined` (or any other value not explicitly handled),
 *                    margins are not added, and raw dimensions are returned.
 * @returns An object `{ width, height }` representing the final dimensions,
 *          potentially including margins.
 */
export const applyMarginsToBounds = (
  rawWidth: number,
  rawHeight: number,
  margins: CalculatedMargins,
  dimension?: TDimension,
): MeasuredDimensions => {
  let finalWidth = rawWidth;
  let finalHeight = rawHeight;

  // Add horizontal margins if requested by the dimension strategy
  if (
    dimension === Dimension.measureWidth ||
    dimension === Dimension.measureBothWithMargins
  ) {
    finalWidth += margins.marginLeftRight;
  }

  // Add vertical margins if requested by the dimension strategy
  if (
    dimension === Dimension.measureHeight ||
    dimension === Dimension.measureBothWithMargins
  ) {
    finalHeight += margins.marginTopBottom;
  }

  // If 'dimension' is undefined or doesn't match a specific margin-adding
  // strategy, finalWidth and finalHeight remain as rawWidth and rawHeight.
  return { width: finalWidth, height: finalHeight };
};

/**
 * Represents the initial state derived from an element.
 */
export type InitialElementState = {
  rawDimensions: MeasuredDimensions;
  margins: CalculatedMargins;
};

/**
 * Captures a snapshot of an element's initial state, including its border-box
 * dimensions and computed margins.
 *
 * This function performs two synchronous DOM read operations:
 * 1. `node.getBoundingClientRect()`: To get raw `width` and `height` (border-box).
 * 2. `window.getComputedStyle(node)`: To obtain styles, which are then
 *     processed by `getMarginsFromStyle` to sum vertical and horizontal
 *     margins.
 *
 * Note: Synchronous calls like these can force layout/style flushes. This
 * function is intended for capturing an initial state and should be used
 * judiciously, especially in performance-critical paths or loops.
 *
 * @param node The target HTML element to measure.
 * @returns An object containing the element's initial border-box dimensions and
 *          its summed CSS margins.
 */
export const getInitialElementState = (
  node: HTMLElement,
): InitialElementState => {
  // 1. Get initial raw dimensions (border-box)
  const initialRect = node.getBoundingClientRect();
  const rawDimensions = {
    width: initialRect.width,
    height: initialRect.height,
  };

  // 2. Get initial margins from computed style
  const initialStyle = window.getComputedStyle(node);
  const margins = getMarginsFromStyle(initialStyle);

  return { rawDimensions, margins };
};

/**
 * Defines the structure returned by `calculateAndCompareMargins`.
 * It bundles the newly computed margins with a flag indicating whether these
 * margins differ from a previously known state.
 */
export type MarginCalculationResult = {
  /**
   * The latest margins calculated from the element's computed style.
   */
  newMargins: CalculatedMargins;
  /**
   * True if `newMargins` are different from the margins they were compared
   * against, false otherwise.
   */
  didChange: boolean;
};

/**
 * Computes an element's current CSS margins and determines if they have changed
 * compared to a previously known set of margins.
 *
 * This function typically involves:
 * 1. Retrieving current styles via `window.getComputedStyle(target)`.
 * 2. Calculating margins using `getMarginsFromStyle()`.
 * 3. Comparing the newly calculated margins to `previousMargins`.
 *
 * Note: This function performs a synchronous DOM read (`getComputedStyle()`).
 * Use judiciously in performance-sensitive contexts.
 *
 * @param target The HTML element whose margins are to be analyzed.
 * @param previousMargins The `CalculatedMargins` object representing the
 *                        previously known margin values for comparison.
 * @returns An object containing the element's newly calculated margins and a
 *          boolean indicating if they differ from the `previousMargins`.
 */
export const calculateAndCompareMargins = (
  target: HTMLElement,
  previousMargins: CalculatedMargins,
): MarginCalculationResult => {
  const style = window.getComputedStyle(target);
  const newMargins = getMarginsFromStyle(style);

  const didChange =
    newMargins.marginTopBottom !== previousMargins.marginTopBottom ||
    newMargins.marginLeftRight !== previousMargins.marginLeftRight;

  return { newMargins, didChange };
};

/**
 * Returns the element’s border-box size (content + padding + border; no margin)
 * from a `ResizeObserverEntry`.
 *
 * Approach
 * - Uses `entry.borderBoxSize` when available (avoids layout flush).
 * - Falls back to `getBoundingClientRect()` for compatibility when the property
 *   is not implemented (e.g., Safari ≤15.3) or when no border-box fragment is present.
 *
 *
 * Fragments
 * - `borderBoxSize` is a `FrozenArray<ResizeObserverSize>`.
 *   Most elements yield a single fragment; if multiple fragments exist, the
 *   first fragment is used.
 *
 * Logical size fields
 * - `inlineSize`: size along the inline (text-flow) axis.
 * - `blockSize` : size along the block (perpendicular-to-text) axis.
 *
 * Projection to physical axes
 * - `inlineSize` → width
 * - `blockSize`  → height
 *   This matches common horizontal writing modes; for vertical writing modes,
 *   consider the rect fallback or a writing-mode–aware mapping.
 *
 * Browser notes
 * - Safari (macOS/iOS) ≤15.3: `borderBoxSize` not implemented.
 * - Safari 15.4+, Firefox 92+, Chromium/Edge 84+: `borderBoxSize` present as an array.
 *
 * @param entry  The `ResizeObserverEntry` from the observer callback.
 * @returns      `{ width, height }` (floating-point, CSS pixels) for the element’s border box.
 */
export const extractRawDimensions = (
  entry: ResizeObserverEntry,
): MeasuredDimensions => {
  if (hasBorderBox(entry)) {
    const [firstBorderBoxFragment] = entry.borderBoxSize;

    if (firstBorderBoxFragment) {
      return {
        width: firstBorderBoxFragment.inlineSize,
        height: firstBorderBoxFragment.blockSize,
      };
    }
  }

  // Fallback for older Safari or unexpected shapes.
  const rect = entry.target.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
};
