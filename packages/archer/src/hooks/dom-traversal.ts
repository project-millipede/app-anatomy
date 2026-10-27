/**
 * The native browser API `element.closest()` is often too broad for
 * component-based architectures. Its search can "escape" a component's intended
 * scope by traversing all the way up to the document root, potentially finding
 * an incorrect match and causing subtle bugs.
 *
 * The functions in this file solve this problem by accepting a
 * `containerElement` that acts as a strict boundary for the search. This
 * ensures that all DOM queries remain safely encapsulated within the intended
 * component or container.
 */

/**
 * Finds the nearest ancestor of a given element (including itself) that matches
 * a selector, but strictly within the bounds of a given container element.
 *
 * The search iterates up the DOM tree, performing the following checks in each
 * loop:
 * 1. It checks if the current element matches the selector.
 * 2. It checks if the current element is the container boundary, stopping if
 *    so.
 * 3. If no match or boundary is found, it moves up to the `parentElement`.
 *
 * @param startElement The DOM element where the upward search begins.
 * @param selector The CSS selector to match against.
 * @param containerElement The ancestor element that acts as the boundary for the search.
 * @returns The found element, or `null` if no match is found within the container.
 */
export function findClosestInContainer(
  startElement: Element | null,
  selector: string,
  containerElement: Element | null,
): Element | null {
  // A valid starting element and container are required to begin the search.
  if (!startElement || !containerElement) {
    return null;
  }

  let current: Element | null = startElement;

  // The loop continues as long as `current` is a valid DOM element.
  while (current) {
    /**
     * 1. Check for a successful match.
     *    If the current element matches the selector, the search is complete.
     */
    if (current.matches(selector)) {
      return current;
    }

    /**
     * 2. Check for the boundary condition.
     *    If the current element is the container itself and it didn't match in
     *    the check above, the search must terminate here.
     */
    if (current === containerElement) {
      return null;
    }

    /**
     * 3. Move to the next parent for the next iteration.
     *    This step drives the upward traversal. If `current` has no parent,
     *    `parentElement` will be `null`, which will cause the `while` loop to
     *    terminate on the next cycle.
     */
    current = current.parentElement;
  }

  // If the loop completes, it means the top of the DOM was reached without a
  // match.
  return null;
}

/**
 * Finds the nearest ancestor of a given element (including itself) that matches
 * a selector, using a recursive approach. The search is strictly contained
 * within the bounds of a given container element.
 *
 * This function provides a declarative alternative to the iterative version.
 *
 * The logic is defined by its "base cases" (stopping conditions):
 * 1. Invalid State Check
 *    The recursion stops if the `currentElement` is invalid or has escaped the
 *    container.
 * 2. Success Case
 *    The recursion stops if a match for the `selector` is found.
 * 3. Boundary Case
 *    The recursion stops if the `containerElement` boundary is reached without
 *    a match.
 *
 *  If no base case is met, the function calls itself with the `parentElement`.
 *
 * @param currentElement The DOM element to check in the current step of the recursion.
 * @param selector The CSS selector to match against.
 * @param containerElement The ancestor element that acts as the boundary for the search.
 * @returns The found element, or `null` if no match is found within the container.
 */
export function findClosestInContainerRecursive(
  currentElement: Element | null,
  selector: string,
  containerElement: Element | null,
): Element | null {
  /**
   * 1. Check for invalid or out-of-bounds state (the primary stop condition).
   *    If the current element is null, or if it is no longer contained within
   *    the boundary, the search has failed. This also naturally stops the
   *    recursion when it reaches the top of the DOM.
   */
  if (
    !currentElement ||
    !containerElement ||
    !containerElement.contains(currentElement)
  ) {
    return null;
  }

  /**
   * 2. Check for a successful match (the success case).
   *    If the current element matches the selector, we have our result.
   *    Return it immediately to end the recursion.
   */
  if (currentElement.matches(selector)) {
    return currentElement;
  }

  /**
   * 3. Check for the boundary condition (the boundary stop condition).
   *    If the current element is the container itself and it didn't match in
   *    the check above, the search must stop here.
   */
  if (currentElement === containerElement) {
    return null;
  }

  /**
   * If no base case was met, continue the search by recursing upwards.
   * Call the function again, but this time starting from the `parentElement`.
   * This moves the search one level up the DOM tree.
   */
  return findClosestInContainerRecursive(
    currentElement.parentElement,
    selector,
    containerElement,
  );
}
