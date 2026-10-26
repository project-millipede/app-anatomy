import type { ReactNode, RefObject, ReactElement, RefCallback } from 'react';

export const AnchorPosition = {
  top: 'top',
  bottom: 'bottom',
  left: 'left',
  right: 'right',
  // middle: 'middle'
} as const;

export type TAnchorPosition =
  (typeof AnchorPosition)[keyof typeof AnchorPosition];

export type SyncHandle = {
  sync?: (y?: number) => void;
  anchorAnimationInit: (anchorId: string) => void;
  anchorAnimationDidStart: (anchorId: string) => void;
  anchorAnimationDidEnd: (anchorId: string) => void;
};

export type LineStyle = {
  strokeColor?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
};

/** Select one of Archer's existing path builders. */
export type PathStyle = 'smooth' | 'sharp' | 'sharp-animatable';

export type Relation = {
  targetId: string;
  targetAnchor: TAnchorPosition;
  sourceAnchor: TAnchorPosition;
  optionalTargetAnchor?: TAnchorPosition;
  optionalSourceAnchor?: TAnchorPosition;
  label?: ReactNode;
  style?: LineStyle;
  layout?: 'smart' | 'default';
  pathStyle?: PathStyle;
  /**
   * Opaque extension intent attached to this relation.
   *
   * Keeping it `unknown` prevents application vocabulary such as `straight`,
   * `bridge`, and `flow` from leaking into Archer's core types.
   *
   * When installed, {@link RoutingResolver} and {@link EdgeDecorator} receive
   * this value unchanged. Archer does not interpret it.
   *
   * `meta` is registration-time data, not a live update signal.
   */
  meta?: unknown;
};

/**
 * Extension-seam contracts moved to `./extensions` (one slice per seam:
 * `extensions/routing`, `extensions/decoration`). Re-exported here so
 * `@app/archer` / `ArcherTypes` consumers (e.g. `ArcherTypes.RoutingResolver`,
 * `ArcherTypes.EdgeDecorator`) keep resolving unchanged, and `Relation.meta`'s
 * `{@link RoutingResolver}` link still binds. Core depends on nothing in
 * `extensions`; `extensions` depends on core (it imports `RoutingInstruction`).
 */
export type {
  RoutingResolver,
  EdgeDecoration,
  EdgeDecorator,
} from './extensions';

export type ArcherRef = {
  ref: RefObject<Element | null> | null;
  dynamicRef: RefObject<SyncHandle | null> | null;
};

export type RenderFnParameter = {
  ref: RefObject<Element | null> | RefCallback<Element>;
  dynamicRef?: RefObject<SyncHandle | null>;
};

/**
 * Compatibility options from the original Archer API. Effect cleanup removes
 * this source's previous relations before a changed declaration is ingested.
 * `replaceAll` additionally removes the source at the beginning of the effect.
 */
export type ArcherElementUpdateStrategy = 'replaceAll' | 'addOrUpdate';

export type ArcherElementProps = {
  /**
   * Stable, unique identifier for this source node. Changing the `id` is
   * treated like “unmount → mount”: the old edges are removed during
   * effect-cleanup and a fresh set is ingested for the new id.
   */
  id: string;

  /**
   * Outgoing edges declared by this source.
   * Omit or pass an empty array when the node currently has no targets.
   */
  relations?: Array<Relation>;

  /**
   * Enables an extra `dynamicRef` (imperative helpers such as `sync()`,
   * `select()`, etc.) and marks the element as user-interactive in Archer.
   * @default false
   */
  interactive?: boolean;

  /**
   * Strategy for updating edges when `relations` change.
   * See {@link ArcherElementUpdateStrategy}.
   * @default 'addOrUpdate'
   */
  updateStrategy?: ArcherElementUpdateStrategy;

  /**
   * Render-prop alternative to `children`.
   * Receives `{ ref, dynamicRef? }` and must return a single React element.
   * If provided, it takes precedence over `children`.
   */
  render?: (arg: RenderFnParameter) => ReactNode;

  /**
   * Child element to be wrapped when no `render` prop is supplied.
   * Must be a single `ReactElement` (fragments are unsupported).
   */
  children?: ReactElement;
};

export type IPoint = {
  x: number;
  y: number;
};

/**
 * A discriminated union that represents the specific routing instructions
 * for a self-referencing arrow that must loop around its own element.
 */
export type SelfLoopInstruction =
  | { type: 'HORIZONTAL_SELF_LOOP'; y: number }
  | { type: 'VERTICAL_SELF_LOOP'; x: number };

/**
 * Instruction for a path that is obstructed by other elements within the same
 * container and requires a specific U-turn or box-shaped path.
 */
export type ObstructedUturnInstruction =
  // For a normal C-shaped path when start/end points are not aligned.
  | {
      type: 'OBSTRUCTED_U_TURN';
      connectionSide: TAnchorPosition;
    }
  // For a "flat-line" or long-distance U-turn that requires a box-shaped path.
  | {
      type: 'OBSTRUCTED_U_TURN_BOX';
      connectionSide: TAnchorPosition;
      loopSide: TAnchorPosition;
      loopBoundary: number;
    }
  | { type: 'LOCAL_RELATIVE_U_TURN' }
  | { type: 'LOCAL_RELATIVE_ELBOW' };

/**
 * Instruction for a path between two different containers that requires a wide,
 * container-aware box path to route around all elements.
 */
export type InterContainerPathInstruction = {
  type: 'INTER_CONTAINER_BOX';
  loopSide: TAnchorPosition;
  loopBoundary: number;
};

export type InterContainerElbowInstruction = { type: 'INTER_CONTAINER_ELBOW' };

export type InterContainerUTurnInstruction = { type: 'INTER_CONTAINER_U_TURN' };

// Add these to your instruction types
export type LocalRelativeUturnInstruction = { type: 'LOCAL_RELATIVE_U_TURN' };
export type LocalRelativeElbowInstruction = { type: 'LOCAL_RELATIVE_ELBOW' };

/**
 * Instruction for the simplest path type: a direct, straight line between
 * two adjacent elements.
 */
export type StraightLineInstruction = {
  type: 'STRAIGHT_LINE';
};

/**
 * A discriminated union that represents every possible routing strategy
 * determined by the `useArrowGeometry` hook. The `type` property allows for
 * safe type narrowing in downstream path-building functions.
 */
export type RoutingInstruction =
  | { type: 'NO_LOOP' } // The default fallback type
  | SelfLoopInstruction
  | ObstructedUturnInstruction
  | InterContainerPathInstruction
  | InterContainerElbowInstruction
  | InterContainerUTurnInstruction
  | LocalRelativeUturnInstruction
  | LocalRelativeElbowInstruction
  | StraightLineInstruction;

/**
 * Discriminator values exposed by {@link RoutingInstruction}.
 *
 * The routing module derives this vocabulary once beside the union that owns
 * it. Consumers can use the named type without indexing into the instruction
 * representation.
 */
export type RoutingInstructionType = RoutingInstruction['type'];

/**
 * Defines the preferred routing strategy for same-axis self-referencing arrows.
 */
export const SelfLoopRouting = {
  /**
   * Loops will go around the 'top' (for left-right connections) or
   * 'left' (for top-bottom connections) side of the element.
   * This path is generally "clockwise" for left-to-right connections.
   */
  CLOCKWISE: 'clockwise',

  /**
   * Loops will go around the 'bottom' (for left-right connections) or
   * 'right' (for top-bottom connections) side of the element.
   * This path is generally "counter-clockwise" for left-to-right connections.
   */
  COUNTER_CLOCKWISE: 'counter-clockwise',
} as const;

/**
 * The type definition for the self-loop routing style, derived from the
 * SelfLoopRouting object to ensure type safety.
 */
export type SelfLoopRoutingStyle =
  (typeof SelfLoopRouting)[keyof typeof SelfLoopRouting];

export const Axis = {
  horizontal: 'horizontal',
  vertical: 'vertical',
} as const;

export type TAxis = (typeof Axis)[keyof typeof Axis];
