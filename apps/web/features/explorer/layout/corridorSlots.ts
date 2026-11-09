/** Three reserved positions in the existing bridge grid. */
export const CORRIDOR_SLOT_COUNT = 3;

type CorridorSlots<T> = readonly [T | undefined, T | undefined, T | undefined];

/**
 * Arrange a bounded page in the positions shared by cards and center ports.
 * A single connection is centered; pairs and triples retain their order.
 * @param visibleConnections At most three connections selected for this page.
 * @returns Three positions, including placeholders for unoccupied slots.
 */
export function arrangeCorridorSlots<T>(
  visibleConnections: readonly T[],
): CorridorSlots<T> {
  const [first, second, third] = visibleConnections;
  if (visibleConnections.length === 1) return [undefined, first, undefined];
  return [first, second, third];
}
