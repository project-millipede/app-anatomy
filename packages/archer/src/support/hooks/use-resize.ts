import { useCallback, useEffect, useRef, useState } from 'react';
import { useCallbackRef } from './use-callback-ref';
import { CallbackRef } from '../types';

import type {
  TDimension,
  MeasuredDimensions,
  CalculatedMargins,
} from './utils/resize.constants';
import {
  getInitialElementState,
  calculateAndCompareMargins,
  extractRawDimensions,
  applyMarginsToBounds,
} from './utils/resize.utils';
import { type DebouncedFunction, debounce } from './utils/debounce';

const DEFAULT_DEBOUNCE_DELAY = 250;

export type ResizeOptions = {
  /**
   * Specifies which dimension(s) to measure and whether to include margins.
   * If undefined, measures raw width/height (border-box).
   * See `Dimension` enum in resize.constants.
   */
  dimension?: TDimension;
  /**
   * The delay (in milliseconds) for debouncing the margin calculation, only
   * applicable if `recalculateMarginsOnResize` is explicitly set to true.
   * Defaults to DEFAULT_DEBOUNCE_DELAY (150ms).
   * Set to 0 to disable debouncing for margins (not recommended for performance).
   */
  debounceDelay?: number;
  /**
   * If false (default), margins are calculated only once on initial mount and
   * assumed static.
   * If true, margins will be recalculated via a debounced mechanism when the
   * element resizes.
   */
  recalculateMarginsOnResize?: boolean;
};

/**
 * @hook useResize
 * @description Observes the dimensions of a target DOM element using ResizeObserver.
 *
 * --- Main Features ---
 * - Reports element dimensions (width and height).
 * - Optionally includes the element's margins in the reported dimensions,
 *   configurable via the `dimension` option.
 *   By default, margins are calculated once on mount.
 * - Provides immediate dimension updates for the element's border-box size on
 *   resize.
 * - If `recalculateMarginsOnResize` is explicitly set to true, it debounces the
 *   potentially expensive calculation of margins to improve performance during
 *   rapid resize events (e.g., window resizing).
 * - Calculates initial dimensions (including margins if requested)
 *   synchronously on mount for an accurate first render.
 *
 * --- Execution Flow & Special Aspects ---
 * This hook employs a specific strategy to balance responsiveness and
 * performance:
 *
 * 1. Initial Mount (`attachElement`):
 *    When the ref is first attached to an element:
 *    - Both the raw dimensions (border-box) and margins (via `getComputedStyle`)
 *      are calculated synchronously using the `getInitialElementState` utility.
 *    - The initial `bounds` state is set immediately via `updateFinalBounds` with the
 *      fully calculated dimensions (raw + margins, if requested).
 *    - The `ResizeObserver` is then attached to monitor subsequent size changes.
 *
 * 2. Subsequent Resizes (`rawOnResize` - Immediate Callback):
 *    When `ResizeObserver` detects a size change, this callback runs immediately.
 *    - It captures the latest raw dimensions (width/height including padding/border)
 *      from the `ResizeObserverEntry` using the `extractRawDimensions` utility.
 *    - It immediately calls `updateFinalBounds`. This updates the `bounds` state
 *      using the new raw dimensions combined with the last known margins
 *      (stored in `latestMarginsRef`). This provides instant visual feedback for the
 *      core size change.
 *    - If `recalculateMarginsOnResize` is true, it then triggers the debounced
 *      margin calculation (`debouncedMarginCalculatorRef`) via the
 *      `calculateAndStoreMargins` function.
 *      Otherwise, margins are not recalculated.
 *
 * 3. Debounced Margin Calculation (`calculateAndStoreMargins`):
 *    (Only active if `recalculateMarginsOnResize` is true)
 *    This function executes only after the `debounceDelay` has passed without
 *    further calls to `rawOnResize`.
 *    - It uses the `calculateAndCompareMargins` utility which performs the potentially
 *      expensive operation: calling `window.getComputedStyle` and calculating the current margins.
 *    - It compares the newly calculated margins with the previously stored ones
 *      (passed from `latestMarginsRef`).
 *    - If the margins have changed (based on the `didChange` result from the utility):
 *        - It updates `latestMarginsRef` with the new margin values.
 *        - It calls `updateFinalBounds` again. This time, `updateFinalBounds` uses
 *          the latest raw dimensions (which might have updated again since the
 *          immediate callback ran) and the newly calculated margins. This ensures
 *          the state eventually converges to the most accurate total size.
 *
 * --- Rationale ---
 * - Immediate Raw Update: Ensures UI elements that depend on the core size
 *   (excluding margins) react instantly to resizes, preventing visual lag.
 * - Optional Debounced Margin Update: Prevents performance issues caused by
 *   repeatedly calling `getComputedStyle` if margin recalculation is explicitly
 *   enabled.
 *   By default, margin recalculation is off for performance if static margins
 *   are assumed.
 * - Synchronous Initial Calculation: Provides the correct dimensions, including
 *   margins, from the very first render, avoiding an initial "jump" as margins
 *   are calculated later.
 *
 * @param options - Configuration options for the hook.
 * @returns A tuple containing:
 *          - `setRef`: A callback ref function to attach to the target DOM element.
 *          - `bounds`: An object containing the latest calculated `width` and `height`.
 *                     The values include margins based on the `dimension` option.
 *                     Initialized to `{ width: 0, height: 0 }` before first measurement.
 */
export const useResize = (
  options: ResizeOptions = {},
): [CallbackRef<HTMLElement>, MeasuredDimensions] => {
  const {
    dimension,
    debounceDelay = DEFAULT_DEBOUNCE_DELAY,
    recalculateMarginsOnResize = false,
  } = options;

  // Ref to hold the ResizeObserver instance
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Ref to hold the debounced version of the margin calculation function
  const debouncedMarginCalculatorRef = useRef<DebouncedFunction<
    (target: HTMLElement) => void
  > | null>(null);

  // --- State and Refs ---
  // The state holding the final calculated bounds (raw + margins, if
  // applicable) exposed to the consumer
  const [bounds, setBounds] = useState<MeasuredDimensions>({
    width: 0,
    height: 0,
  });

  // Ref storing the latest raw dimensions (border-box) updated immediately by
  // ResizeObserver
  const latestRawDimensionsRef = useRef<MeasuredDimensions>({
    width: 0,
    height: 0,
  });

  // Ref storing the latest calculated margins.
  // If recalculateMarginsOnResize is true, it's updated by the debounced
  // function. Otherwise, it's set once on mount.
  const latestMarginsRef = useRef<CalculatedMargins>({
    marginTopBottom: 0,
    marginLeftRight: 0,
  });

  // Ref storing the currently observed HTML element instance
  const observedElementRef = useRef<HTMLElement | null>(null);

  /**
   * @function updateFinalBounds
   * @description Calculates the final bounds state by combining the latest
   * known raw dimensions (from `latestRawDimensionsRef`) with the latest known
   * margins (from `latestMarginsRef`), according to the 'dimension' option
   * specified to the hook.
   * It then updates the `bounds` state, but only if the calculated final bounds
   * actually differ from the current state, preventing unnecessary re-renders.
   * This function is called both immediately on raw resize and after debounced
   * margin calculation (if active).
   */
  const updateFinalBounds = useCallback(
    () => {
      const finalBounds = applyMarginsToBounds(
        latestRawDimensionsRef.current.width,
        latestRawDimensionsRef.current.height,
        latestMarginsRef.current,
        dimension, // from hook options
      );

      // Update public state only if calculated bounds have changed
      setBounds((currentBounds) => {
        if (
          currentBounds.width !== finalBounds.width ||
          currentBounds.height !== finalBounds.height
        ) {
          return finalBounds;
        }
        return currentBounds;
      });
    },
    // Dependency: Only needs to be recreated if 'dimension' option changes
    [dimension],
  );

  /**
   * @function calculateAndStoreMargins
   * @description The core function that is debounced (if
   * recalculateMarginsOnResize is true). It's responsible for calculating the
   * element's current margins and updating the state if they have changed.
   * Uses the `calculateAndCompareMargins` utility to perform the calculation
   * and comparison.
   * If the utility reports that margins have changed (`didChange` is true),
   * this function updates the `latestMarginsRef` and triggers
   * `updateFinalBounds` to recalculate the final state with the new margin
   * values.
   */
  const calculateAndStoreMargins = useCallback(
    (target: HTMLElement) => {
      if (!target) return;

      // Delegate margin calculation and comparison to helper (calculateAndCompareMargins)
      const { newMargins, didChange } = calculateAndCompareMargins(
        target,
        // Pass previous margins for comparison
        latestMarginsRef.current,
      );

      // Only proceed if the margins have actually changed
      if (didChange) {
        // Update the ref holding the latest margin values
        latestMarginsRef.current = newMargins;
        // Trigger a final bounds update (using new margins)
        updateFinalBounds();
      }
    },
    // Dependency: Needs the current `updateFinalBounds` callback
    [updateFinalBounds],
  );

  /**
   * @effect Manages the debounced margin calculator lifecycle.
   * Creates/updates the debounced version of `calculateAndStoreMargins` if
   * `recalculateMarginsOnResize` is true.
   * Includes a cleanup function to cancel any pending debounced execution.
   */
  useEffect(
    () => {
      if (recalculateMarginsOnResize) {
        // Create the debounced function using the utility
        debouncedMarginCalculatorRef.current = debounce(
          calculateAndStoreMargins,
          debounceDelay,
        );
      } else {
        // If recalculation is off, ensure the ref is null.
        // The cleanup function (returned below) will handle cancelling if it
        // was previously active.
        debouncedMarginCalculatorRef.current = null;
      }

      // Return cleanup function that always attempts to cancel and clear the
      // ref.
      return () => {
        debouncedMarginCalculatorRef.current?.cancel();
        debouncedMarginCalculatorRef.current = null;
      };
    },
    // Dependencies: Re-run if logic, settings for delay or activation for
    // recalculation changes
    [calculateAndStoreMargins, debounceDelay, recalculateMarginsOnResize],
  );

  /**
   * @callback rawOnResize
   * @description The IMMEDIATE callback passed directly to the
   * `ResizeObserver`. This function runs instantly every time the
   * ResizeObserver detects a change.
   * Its primary responsibilities are:
   * 1. Extract the latest raw dimensions using `extractRawDimensions` and
   *    update the internal `latestRawDimensionsRef`.
   * 2. Call `updateFinalBounds` IMMEDIATELY to update the public `bounds` state
   *    (using the new raw dimensions + last known margins).
   * 3. If `recalculateMarginsOnResize` is true, trigger the debounced
   *    `calculateAndStoreMargins` function to check for potential margin
   *    changes after a delay.
   */
  const rawOnResize = useCallback(
    (entries: Array<ResizeObserverEntry>) => {
      const [entry] = entries;
      if (!entry) return;
      /**
       * Update observedElementRef to point to the specific target of this
       * resize event. While in typical single-element observation scenarios
       * this might be the same element as initially observed, `entry.target` is
       * the canonical source. This ensures that if the debounced function were
       * to rely solely on this ref (instead of an argument), it would use the
       * most relevant target.
       */
      // observedElementRef.current = entry.target as HTMLElement;

      const targetElement = entry.target as HTMLElement;

      // --- Immediate processing on each resize event ---
      // Step 1: Extract raw dimensions via helper and update internal ref
      latestRawDimensionsRef.current = extractRawDimensions(entry);

      // Step 2: Update public `bounds` state immediately (uses latest raw + last known margins)
      updateFinalBounds();

      // Step 3: Trigger the debounced margin check (if enabled and debouncer exists)
      if (recalculateMarginsOnResize && debouncedMarginCalculatorRef.current) {
        debouncedMarginCalculatorRef.current(targetElement);
      }
      // --- End Immediate processing ---
    },
    // Dependency: Needs the current `updateFinalBounds` callback and
    // `recalculateMarginsOnResize` setting
    [updateFinalBounds, recalculateMarginsOnResize],
  );

  /**
   * @callback attachElement
   * @description Callback provided to `useCallbackRef`. Executed when the ref
   * is attached to a DOM node.
   *
   * NOTE: Initial margins were calculated synchronously in this attach handler
   * (`attachElement`). If `recalculateMarginsOnResize` is true, the debounced
   * margin check is for subsequent updates via `rawOnResize`.
   *
   * Responsibilities:
   * 1. Disconnects any previous ResizeObserver instance.
   * 2. Performs the synchronous initial calculation using
   *    `getInitialElementState` to get both raw dimensions and margins.
   * 3. Updates `latestRawDimensionsRef` and `latestMarginsRef` with these
   *    initial values.
   * 4. Calls `updateFinalBounds` to set the initial public `bounds` state
   *    correctly.
   * 5. Creates and attaches the `ResizeObserver` instance, passing
   *    `rawOnResize` as the callback for subsequent dimension changes.
   */
  const attachElement = useCallback(
    (node: HTMLElement) => {
      // Store the node instance
      observedElementRef.current = node;

      // Step 1: Ensure clean state by disconnecting previous observer
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }

      // --- Perform INITIAL calculation SYNCHRONOUSLY ---
      // Step 2: Calculate initial state via helper (getInitialElementState)
      const initialState = getInitialElementState(node);
      // Step 3: Update internal refs immediately with initial values
      latestRawDimensionsRef.current = initialState.rawDimensions;
      latestMarginsRef.current = initialState.margins;

      // Step 4: Set the public `bounds` state immediately with initial values
      updateFinalBounds();
      // --- End Initial Sync Calculation ---

      // Step 5: Setup the ResizeObserver for subsequent changes
      resizeObserverRef.current = new ResizeObserver(rawOnResize);
      resizeObserverRef.current.observe(node);
    },
    // Dependencies:
    // - rawOnResize: Needed to setup the observer for subsequent calls.
    // - updateFinalBounds: Needed because it's called directly for the initial
    //   state calculation.
    [rawOnResize, updateFinalBounds],
  );

  /**
   * @callback detachElement
   * @description Callback provided to `useCallbackRef`. Executed when the ref
   * is detached from a node or the component unmounts.
   * Responsibilities:
   * 1. Cancels any pending debounced margin calculations (if active).
   * 2. Disconnects the `ResizeObserver` instance to prevent memory leaks.
   * 3. Cleans up internal refs (`resizeObserverRef`, `observedElementRef`).
   */
  const detachElement = useCallback(
    (_node: HTMLElement) => {
      // Added node parameter for completeness, though not strictly used
      // Clear the stored element reference
      observedElementRef.current = null;

      // Step 1: Cancel pending debounced calls
      debouncedMarginCalculatorRef.current?.cancel();

      // Step 2 & 3: Disconnect observer and clear refs
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null; // Clear the ref
      }
    },
    // No dependencies needed for cleanup logic
    [],
  );

  // Use the useCallbackRef hook to manage the observer attachment/detachment
  // lifecycle
  const setRef = useCallbackRef<HTMLElement>(attachElement, detachElement);

  // Return the ref callback and the current bounds state
  return [setRef, bounds];
};
