import { useRef } from 'react';
import type { Relation } from '../types';
import type { SourceToTargetType } from '../types-private';

/**
 * Utility 1: Generic array comparator.
 *
 * @param a First array.
 * @param b Second array.
 * @param itemEquals Equality function applied to items at the same index.
 * @returns True when both arrays are structurally equal.
 */
export function compareArrays<T>(
  a: T[],
  b: T[],
  itemEquals: (x: T, y: T) => boolean,
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((x, idx) => itemEquals(x, b[idx]));
}

/**
 * Utility 2:
 * Shallow comparator for two Relation objects.
 *
 * Layout and extension metadata participate so topology/style edits are observed.
 *
 * @param x First relation.
 * @param y Second relation.
 * @returns True when all compared properties match.
 */
function relationShallowEqual(x: Relation, y: Relation): boolean {
  return (
    x.targetId === y.targetId &&
    x.sourceAnchor === y.sourceAnchor &&
    x.targetAnchor === y.targetAnchor &&
    x.optionalSourceAnchor === y.optionalSourceAnchor &&
    x.optionalTargetAnchor === y.optionalTargetAnchor &&
    x.layout === y.layout &&
    x.pathStyle === y.pathStyle &&
    x.meta === y.meta &&
    x.label === y.label &&
    x.style === y.style // reference equality
  );
}

/**
 * Utility 2a (Helper for Utility 2):
 * Shallow comparator for two Relation arrays.
 *
 * @param a First array of relations.
 * @param b Second array of relations.
 * @returns True when arrays are the same length and each pair is shallow-equal.
 */
export function shallowEqualRelations(a: Relation[], b: Relation[]): boolean {
  return compareArrays(a, b, relationShallowEqual);
}

/**
 * Utility 3:
 * Transforms a relations list into an array of edge definitions
 * (SourceToTargetType).
 * The function establishes a one-to-many (1:n) relationship, where a single
 * source element (identified by sourceId) connects to multiple target elements.
 * Each edge definition in the returned array represents one connection from the
 * source to a specific target element.
 *
 * @param sourceId Id of the owning Archer element.
 * @param relations Array of relations to convert into edge definitions.
 * @returns Array of edge definitions ready for ingestion.
 */
export function generateSourceToTarget(
  sourceId: string,
  relations: Relation[],
): SourceToTargetType[] {
  return relations.map(
    ({
      targetId,
      sourceAnchor,
      targetAnchor,
      optionalSourceAnchor,
      optionalTargetAnchor,
      label,
      style,
      layout,
      pathStyle,
      meta,
    }) => ({
      source: {
        id: sourceId,
        anchor: sourceAnchor,
        optionalAnchor: optionalSourceAnchor,
        layout,
        pathStyle,
        // Forward `Relation.meta` unchanged to the routing resolver and edge decorator.
        meta,
      },
      target: {
        id: targetId,
        anchor: targetAnchor,
        optionalAnchor: optionalTargetAnchor,
        layout,
      },
      label,
      style,
    }),
  );
}

/**
 * Utility 4:
 * React hook that memoises a value using a custom shallow comparison.
 * Keeps the previous reference until `equals` signals a change.
 *
 * @param value Current candidate value.
 * @param equals Predicate that compares previous and current values.
 * @returns Stable memoised value.
 */
export function useShallowCompareMemo<T>(
  value: T,
  equals: (a: T, b: T) => boolean,
): T {
  const ref = useRef(value);
  if (!equals(ref.current, value)) {
    ref.current = value;
  }
  return ref.current;
}
