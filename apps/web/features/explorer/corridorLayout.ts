/** Maximum visible relationships in one compass corridor. */
export const CORRIDOR_CAPACITY = 3;

/**
 * Select a bounded presentation window without changing relationship records.
 * Single cards occupy the middle slot; pairs occupy the first two slots.
 * Pages are zero-based; nonempty start/end ranges are one-based and inclusive.
 * An active relationship wins so restored previews remain visible. Explicit page
 * navigation should clear the preview before requesting another page.
 */
export function getCorridorPage<T extends { relationshipId: string }>(
  links: readonly T[],
  requestedPage: number,
  activeRelationshipId: string | null,
): {
  items: readonly T[];
  slots: readonly (T | undefined)[];
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
} {
  const total = links.length;
  const pageCount = Math.max(1, Math.ceil(total / CORRIDOR_CAPACITY));
  const activeIndex =
    activeRelationshipId === null
      ? -1
      : links.findIndex((link) => link.relationshipId === activeRelationshipId);
  const page =
    activeIndex >= 0
      ? Math.floor(activeIndex / CORRIDOR_CAPACITY)
      : Math.max(0, Math.min(Math.floor(requestedPage) || 0, pageCount - 1));
  const offset = page * CORRIDOR_CAPACITY;
  const items = links.slice(offset, offset + CORRIDOR_CAPACITY);

  return {
    items,
    slots:
      items.length === 1
        ? [undefined, items[0], undefined]
        : [items[0], items[1], items[2]],
    page,
    pageCount,
    start: total === 0 ? 0 : offset + 1,
    end: offset + items.length,
    total,
  };
}
