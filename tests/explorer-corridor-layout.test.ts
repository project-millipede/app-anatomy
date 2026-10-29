import { expect, test } from 'vitest';
import { getCorridorPage } from '../apps/web/features/explorer/corridorLayout';

const links = Array.from({ length: 8 }, (_, index) => ({
  relationshipId: `relationship-${index}`,
}));

test('corridors bound visible cards while retaining evidence order and truthful ranges', () => {
  const middle = getCorridorPage(links, 1, null);
  expect(middle.items.map((link) => link.relationshipId)).toEqual([
    'relationship-3',
    'relationship-4',
    'relationship-5',
  ]);
  expect(middle.items[0]).toBe(links[3]);
  expect(middle).toMatchObject({
    page: 1,
    pageCount: 3,
    start: 4,
    end: 6,
    total: 8,
  });

  const last = getCorridorPage(links, 2, null);
  expect(last.items.map((link) => link.relationshipId)).toEqual([
    'relationship-6',
    'relationship-7',
  ]);
  expect(last).toMatchObject({ start: 7, end: 8, total: 8 });
});

test('shrinking or empty corridors clamp stale page requests without phantom cards', () => {
  const smaller = getCorridorPage(links.slice(0, 4), 2, null);
  expect(smaller.items.map((link) => link.relationshipId)).toEqual([
    'relationship-3',
  ]);
  expect(smaller).toMatchObject({
    page: 1,
    pageCount: 2,
    start: 4,
    end: 4,
    total: 4,
  });
  expect(getCorridorPage([], smaller.page, null)).toEqual({
    items: [],
    page: 0,
    pageCount: 1,
    start: 0,
    end: 0,
    total: 0,
  });
  expect(getCorridorPage(links, -1, null).page).toBe(0);
});

test('restored previews reveal their relationship page while stale previews allow ordinary paging', () => {
  const restored = getCorridorPage(links, 0, 'relationship-6');
  expect(restored.page).toBe(2);
  expect(restored.items).toContain(links[6]);
  expect(restored).toMatchObject({ start: 7, end: 8 });

  const changedContext = getCorridorPage(links, 1, 'previous-context-relation');
  expect(changedContext.page).toBe(1);
  expect(changedContext.items.map((link) => link.relationshipId)).toEqual([
    'relationship-3',
    'relationship-4',
    'relationship-5',
  ]);
});
