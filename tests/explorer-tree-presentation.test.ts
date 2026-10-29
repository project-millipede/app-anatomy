import { expect, test } from 'vitest';
import { collapsedRelatedCounts } from '../apps/web/features/explorer/treePresentation';

test('collapsed counts deduplicate related resources instead of counting their relationships', () => {
  const paths: Record<string, string[]> = {
    first: ['app', 'frameworks', 'version'],
    second: ['app', 'frameworks', 'version'],
    third: ['app', 'helpers'],
  };
  expect([
    ...collapsedRelatedCounts(
      ['first', 'first', 'second', 'third'],
      ['app', 'frameworks'],
      (id) => paths[id]!,
    ),
  ]).toEqual([
    ['version', 2],
    ['helpers', 1],
  ]);
});

test('a related branch counts toward its ancestors without counting itself as a hidden descendant', () => {
  expect([
    ...collapsedRelatedCounts(['framework'], [], () => ['app', 'frameworks']),
  ]).toEqual([
    ['app', 1],
    ['frameworks', 1],
  ]);
});
