import { expect, test } from 'vitest';
import {
  computeArrowGeometry,
  type ArrowGeometry,
} from '../src/utils/geometry';
import type { IPoint, TAnchorPosition } from '../src/types';

function pathCoordinates({ path, label }: ArrowGeometry) {
  expect(path).not.toMatch(/NaN|Infinity|undefined/);
  expect(Number.isFinite(label.x) && Number.isFinite(label.y)).toBe(true);
  const coordinates =
    path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
  expect(coordinates.length).toBeGreaterThanOrEqual(4);
  expect(coordinates.every(Number.isFinite)).toBe(true);
  return coordinates;
}

const bridges: {
  name: string;
  start: IPoint;
  end: IPoint;
  source: TAnchorPosition;
  target: TAnchorPosition;
}[] = [
  {
    name: 'west ingress',
    start: { x: 10, y: 90 },
    end: { x: 110, y: 110 },
    source: 'right',
    target: 'left',
  },
  {
    name: 'east egress',
    start: { x: 150, y: 110 },
    end: { x: 250, y: 90 },
    source: 'right',
    target: 'left',
  },
  {
    name: 'north ingress',
    start: { x: 130, y: 10 },
    end: { x: 150, y: 80 },
    source: 'bottom',
    target: 'top',
  },
  {
    name: 'south egress',
    start: { x: 150, y: 140 },
    end: { x: 130, y: 230 },
    source: 'bottom',
    target: 'top',
  },
];

// Compass bridges have deliberately offset endpoints, so each exercises an elbow rather than a straight line.
test.each(bridges)(
  '$name retains the supplied endpoint positions',
  ({ start, end, source, target }) => {
    const geometry = computeArrowGeometry(
      start,
      end,
      source,
      target,
      { type: 'NO_LOOP' },
      { current: null },
    );
    const coordinates = pathCoordinates(geometry);
    expect(coordinates.slice(0, 2)).toEqual([start.x, start.y]);
    expect(coordinates.slice(-2)).toEqual([end.x, end.y]);
    expect(geometry.path).toContain('L');
  },
);

test('smooth selection uses the existing curve builder and retains both endpoints', () => {
  const start = { x: 20, y: 30 };
  const end = { x: 140, y: 90 };
  const geometry = computeArrowGeometry(
    start,
    end,
    'right',
    'left',
    { type: 'NO_LOOP' },
    { current: null },
    'smooth',
  );
  const coordinates = pathCoordinates(geometry);
  expect(geometry.path).toContain('C');
  expect(geometry.path).not.toContain('L');
  expect(coordinates.slice(0, 2)).toEqual([20, 30]);
  expect(coordinates.slice(-2)).toEqual([140, 90]);
});

test('same-side right anchors route outside both endpoints', () => {
  const geometry = computeArrowGeometry(
    { x: 10, y: 20 },
    { x: 30, y: 60 },
    'right',
    'right',
    { type: 'NO_LOOP' },
    { current: null },
  );
  const coordinates = pathCoordinates(geometry);
  const intermediate = coordinates.slice(2, -2);
  // A right-side U-turn must leave both endpoints on their right, rather than cutting between them.
  expect(intermediate.length).toBeGreaterThanOrEqual(4);
  expect(
    intermediate.filter((_, index) => index % 2 === 0).every((x) => x > 30),
  ).toBe(true);
  expect(geometry.label.x).toBeGreaterThan(30);
});
