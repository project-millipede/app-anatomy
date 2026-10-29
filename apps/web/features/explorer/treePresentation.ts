/** Count distinct related resources beneath collapsed branches, never edges. */
export function collapsedRelatedCounts(
  relatedIds: Iterable<string>,
  expandedIds: readonly string[],
  ancestorIds: (entryId: string) => readonly string[],
): Map<string, number> {
  const expanded = new Set(expandedIds);
  const counts = new Map<string, number>();
  for (const entryId of new Set(relatedIds)) {
    for (const ancestorId of ancestorIds(entryId)) {
      if (!expanded.has(ancestorId)) {
        counts.set(ancestorId, (counts.get(ancestorId) ?? 0) + 1);
      }
    }
  }
  return counts;
}
