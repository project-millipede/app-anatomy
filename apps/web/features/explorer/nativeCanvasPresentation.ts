import type { SelectedResource } from '@apple-code/browser/native';
import type { Report } from '../workspace/types';
import { cpuLabel } from '../workspace/reportPresentation';
import type {
  CanvasDataset,
  CanvasEntry,
  CanvasNeighborhood,
} from './canvasPresentation';

/** Present declarations without manufacturing file locations or candidate outcomes. */
export function nativeCanvasPresentation(
  file: SelectedResource | undefined,
  report: Report | null,
  sliceIndex: number,
  application?: SelectedResource,
): {
  dataset: CanvasDataset;
  entry: CanvasEntry | undefined;
  neighborhood: CanvasNeighborhood;
} {
  const entry: CanvasEntry | undefined = file
    ? { id: file.resource, name: file.name, kind: 'file', parentId: null }
    : application
      ? {
          id: application.resource,
          name: application.name,
          kind: 'directory',
          parentId: null,
        }
      : undefined;
  // A report belongs to an observed resource, not to its display name.
  const images =
    report?.resource === file?.resource ? (report?.analysis.images ?? []) : [];
  const image = images[sliceIndex];
  const relationships = (image?.dependencies?.libraries ?? []).map(
    (library, index) => ({
      id: `declaration-${index}`,
      kind: 'declared-library',
      label: library.name.display || '(empty library name)',
      reference: library.name.display,
      status: 'target-not-evaluated',
    }),
  );
  return {
    entry,
    dataset: {
      id: application?.resource ?? file?.resource ?? 'native-empty',
      entries: entry ? [entry] : [],
      contexts: images.length
        ? images.map((slice, index) => ({
            id: String(index),
            label: `Slice ${index + 1} · ${cpuLabel(slice.cpu)}`,
          }))
        : [
            {
              id: '0',
              label: file
                ? 'Awaiting dependency inspection'
                : application
                  ? 'Select an application file'
                  : 'Open an application or binary',
            },
          ],
      relationships,
    },
    neighborhood: {
      north: [],
      west: [],
      east: [],
      south: relationships.map((relationship) => ({
        relationshipId: relationship.id,
        endpointIds: [],
      })),
    },
  };
}
