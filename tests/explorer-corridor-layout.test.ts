import { expect, test } from 'vitest';
import { getCorridorPage } from '../apps/web/features/explorer/corridorLayout';

const corridorConnections = Array.from({ length: 8 }, (_, connectionIndex) => ({
  relationshipId: `relationship-${connectionIndex}`,
  endpointIds: [],
}));

/**
 * Pages and array bounds are zero-based; range ends are exclusive.
 * An absent relationship must leave the requested page applicable.
 */
test('keeps the requested page and range when the active relationship is absent', () => {
  const pagination = getCorridorPage(corridorConnections, {
    pageSize: 3,
    requestedPage: 1,
    activeRelationshipId: 'missing-relationship',
  });

  expect(pagination).toMatchObject({
    page: 1,
    totalPages: 3,
    pageRange: { start: 3, end: 6 },
  });
});

/**
 * The fourth connection belongs to zero-based page 1 with two connections per page.
 * Using two connections per page catches a hardcoded page size of three.
 */
test('an active relationship overrides the requested page', () => {
  const pagination = getCorridorPage(corridorConnections, {
    pageSize: 2,
    requestedPage: 0,
    activeRelationshipId: 'relationship-3',
  });

  expect(pagination).toMatchObject({
    page: 1,
    totalPages: 4,
    pageRange: { start: 2, end: 4 },
  });
});

/**
 * At three connections per page, four connections require a partial second page.
 * Its exclusive end must stop at the input length when zero-based page 2 is requested.
 */
test('returns the partial last page when the requested page is unavailable', () => {
  const remainingConnections = corridorConnections.slice(0, 4);
  const pagination = getCorridorPage(remainingConnections, {
    pageSize: 3,
    requestedPage: 2,
    activeRelationshipId: null,
  });

  expect(pagination).toMatchObject({
    page: 1,
    totalPages: 2,
    pageRange: { start: 3, end: 4 },
  });
});
