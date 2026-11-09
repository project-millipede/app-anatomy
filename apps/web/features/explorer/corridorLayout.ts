import type { CanvasConnection } from './canvasPresentation';

type CorridorPage = {
  /** One-based page number. */
  page: number;
  pageSize: number;
  /** Connections in this corridor before pagination. */
  totalItems: number;
  /** Includes one empty navigation page when totalItems is zero. */
  totalPages: number;
  /** Zero-based array bounds: start is inclusive, end is exclusive. */
  pageRange: {
    start: number;
    end: number;
  };
};

type CorridorPageOptions = {
  /** Maximum connections per page; a positive integer supplied by the layout. */
  pageSize: number;

  /** One-based integer page requested by the caller. */
  requestedPage: number;

  /**
   * Select this relationship's containing page when found in the corridor.
   * Null or an absent relationship leaves the requested page applicable.
   */
  activeRelationshipId: string | null;
};

/**
 * Calculate paging metadata without arranging visual slots.
 * An active relationship takes priority over the requested page when found.
 * The resulting page is bounded to the available range.
 *
 * @param connections Connections in their presentation order.
 * @param options Page selection inputs.
 * @returns Page information and array bounds for the visible connections.
 */
export function getCorridorPage(
  connections: readonly CanvasConnection[],
  { pageSize, requestedPage: page, activeRelationshipId }: CorridorPageOptions,
): CorridorPage {
  const totalItems = connections.length;
  if (totalItems === 0) {
    return {
      page: 1,
      pageSize,
      totalItems: 0,
      totalPages: 1,
      pageRange: { start: 0, end: 0 },
    };
  }

  const totalPages = Math.ceil(totalItems / pageSize);

  // Keep an active preview visible when it belongs to this corridor.
  if (activeRelationshipId !== null) {
    const activeIndex = connections.findIndex(
      (connection) => connection.relationshipId === activeRelationshipId,
    );
    if (activeIndex >= 0) page = Math.floor(activeIndex / pageSize) + 1;
  }

  // Keep the requested page within the available range after connections change.
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  const start = (page - 1) * pageSize;
  const end = Math.min(start + pageSize, totalItems);

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    pageRange: { start, end },
  };
}
