import { RoutingInstruction } from '../types';

/**
 * The only three adjacency outcomes we care about.
 */
export type AdjacencyRelation = 'previous' | 'next' | 'none';

/**
 * A simple data object that holds the four pre-calculated boundary coordinates
 * for paths that must loop around an element.
 */
export type LoopPathBoundaries = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

// The extensible cache object. We can add more properties here later.
export type CalculationCache = {
  adjacency?: AdjacencyRelation;
  sourceUnitElement?: Element | null;
  targetUnitElement?: Element | null;
  loopPathBoundaries?: LoopPathBoundaries;
  loopBoundary?: number;
  sourceInstanceElement: Element | null;
  targetInstanceElement: Element | null;
  layoutInstruction: RoutingInstruction | null;
  instanceAdjacency?: AdjacencyRelation;
};
