/** Minimal presentation records consumed by the relationship canvas. */
export type CanvasEntry = {
  id: string;
  name: string;
  kind?: string;
  parentId?: string | null;
  /** A display path only when the supplied evidence actually includes one. */
  path?: string;
};

export type CanvasContext = {
  id: string;
  label: string;
};

export type CanvasRelationship = {
  id: string;
  kind: string;
  label: string;
  reference: string;
  status: string;
};

export type CanvasConnection = {
  relationshipId: string;
  /** Represented file endpoints only; declarations without a target use []. */
  endpointIds: string[];
};

export type CanvasNeighborhood = {
  north: readonly CanvasConnection[];
  west: readonly CanvasConnection[];
  east: readonly CanvasConnection[];
  south: readonly CanvasConnection[];
};

export type CanvasDataset = {
  id: string;
  entries: readonly CanvasEntry[];
  contexts: readonly CanvasContext[];
  relationships: readonly CanvasRelationship[];
};

export type CanvasMode = 'inventory' | 'declarations';
