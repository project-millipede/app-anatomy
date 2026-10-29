'use client';

import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Archer, type ArcherTypes } from '@apple-code/archer';
import { Button } from '../workspace/ark/Button';
import { BridgeGrid, BridgeViewport } from './layout/BridgeGrid';
import { BridgeSection, type BridgePosition } from './layout/BridgeSection';
import { CanvasPane } from './layout/CanvasPane';
import { getCorridorPage } from './corridorLayout';
import type {
  CanvasDataset,
  CanvasEntry,
  CanvasNeighborhood,
  CanvasConnection,
  CanvasMode,
} from './canvasPresentation';
import styles from './ExplorerLayout.module.css';

const { ArcherSurface, ArcherElement } = Archer;
const bridgeLabels = {
  north: [
    'External ingress',
    'Incoming references from outside this inventory',
  ],
  west: ['Bundle ingress', 'Internal resources referencing this entry'],
  east: ['Bundle egress', 'Internal targets and candidates'],
  south: [
    'External / unresolved egress',
    'System references and unknown targets',
  ],
} as const;
const declarationBridgeLabels = {
  north: ['External ingress', 'Incoming references were not acquired'],
  west: ['Incoming references', 'Source relationships were not acquired'],
  east: ['File targets', 'Reference targets have not been evaluated'],
  south: ['Declared references', 'Library names recorded in this slice'],
} as const;
const declarationEmptyLabels = {
  north: 'External incoming references are unknown; they were not acquired.',
  west: 'Incoming source relationships are unknown; they were not acquired.',
  east: 'Declared reference file targets have not been evaluated.',
  south: 'No declared library references were returned for this slice.',
} as const;
const positions = ['north', 'west', 'east', 'south'] as const;
const firstPages: Record<BridgePosition, number> = {
  north: 0,
  west: 0,
  east: 0,
  south: 0,
};

export type ExplorerRelationshipCanvasProps = {
  dataset: CanvasDataset;
  selectedEntry: CanvasEntry | undefined;
  neighborhood: CanvasNeighborhood | undefined;
  contextId: string;
  activeRelationshipId: string | null;
  canGoBack: boolean;
  onContextChange: (id: string) => void;
  onPreview: (connection: CanvasConnection) => void;
  onClearPreview: () => void;
  onBack: () => void;
  /** Declarations do not claim a file target, acquired inventory or bundle boundary. */
  mode?: CanvasMode;
  /** Distinguish absent dependency inspection from a completed empty declaration list. */
  declarationsInspected?: boolean;
  /** Confirmed application navigation scope; does not establish dependency targets. */
  applicationName?: string;
  /** Selected-file actions, supplied by the presentation owner. */
  actions?: ReactNode;
  /** Operation feedback kept beside the actions rather than in navigation. */
  feedback?: ReactNode;
};

/** Fixed presentation slots pair each visible card with its own center-edge port. */
export function ExplorerRelationshipCanvas({
  dataset,
  selectedEntry,
  neighborhood,
  contextId,
  activeRelationshipId,
  canGoBack,
  onContextChange,
  onPreview,
  onClearPreview,
  onBack,
  mode = 'inventory',
  declarationsInspected = true,
  applicationName,
  actions,
  feedback,
}: ExplorerRelationshipCanvasProps) {
  const declarations = mode === 'declarations';
  const applicationCenter = declarations && selectedEntry?.kind === 'directory';
  const nativePrompt = applicationCenter
    ? 'Select a file from the application to read declared references.'
    : selectedEntry
      ? 'Inspect the selected file to read declared references.'
      : 'Open an application or binary to begin.';
  const instanceId = useId();
  const layoutKey = JSON.stringify([dataset.id, selectedEntry?.id, contextId]);
  const [pageState, setPageState] = useState({
    key: layoutKey,
    pages: firstPages,
  });
  const requestedPages =
    pageState.key === layoutKey ? pageState.pages : firstPages;
  const allLinks: Record<BridgePosition, readonly CanvasConnection[]> = {
    north: neighborhood?.north ?? [],
    west: neighborhood?.west ?? [],
    east: neighborhood?.east ?? [],
    south: neighborhood?.south ?? [],
  };
  const views = positions.map((position) => ({
    position,
    ...getCorridorPage(
      allLinks[position],
      requestedPages[position],
      activeRelationshipId,
    ),
  }));
  const relations = new Map(
    dataset.relationships.map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  const entries = new Map(dataset.entries.map((entry) => [entry.id, entry]));
  const rootEntry = declarations
    ? undefined
    : dataset.entries.find((entry) => entry.parentId === null);
  const rootPath = rootEntry?.path;
  const displayPath = (path: string) =>
    rootPath && path.startsWith(`${rootPath}/Contents/`)
      ? path.slice(`${rootPath}/Contents/`.length)
      : path;
  const endpointId = (
    position: BridgePosition,
    link: CanvasConnection,
    kind: 'card' | 'port',
  ) =>
    `${instanceId}-${kind}-${encodeURIComponent(JSON.stringify([layoutKey, position, link.relationshipId]))}`;

  function connection(
    position: BridgePosition,
    targetId: string,
    link: CanvasConnection,
  ): ArcherTypes.Relation {
    const relationship = relations.get(link.relationshipId)!;
    const active = link.relationshipId === activeRelationshipId;
    const color =
      position === 'west'
        ? 'var(--explorer-incoming)'
        : position === 'east'
          ? 'var(--explorer-outgoing)'
          : 'var(--explorer-external)';
    return {
      targetId,
      sourceAnchor:
        position === 'north' || position === 'south' ? 'bottom' : 'right',
      targetAnchor:
        position === 'north' || position === 'south' ? 'top' : 'left',
      layout: 'default',
      pathStyle: 'sharp',
      style: {
        strokeColor: active
          ? color
          : `color-mix(in srgb, ${color} 45%, transparent)`,
        strokeWidth: active ? 2 : 1,
        ...(!declarations &&
        (position === 'west' || position === 'east') &&
        relationship.status === 'candidates' &&
        relationship.kind !== 'alias'
          ? { strokeDasharray: '4 3' }
          : {}),
      },
    };
  }

  function changePage(position: BridgePosition, page: number) {
    const pages = { ...firstPages };
    for (const view of views) pages[view.position] = view.page;
    pages[position] = page;
    setPageState({ key: layoutKey, pages });
    // An explicitly requested page replaces the preview; restored previews select
    // their containing page through getCorridorPage when Focus/Back returns.
    onClearPreview();
  }

  function bridge(position: BridgePosition) {
    const view = views.find((value) => value.position === position)!;
    const [title, description] = (
      declarations ? declarationBridgeLabels : bridgeLabels
    )[position];
    const heading =
      declarations && position !== 'south'
        ? `${title} · ${position === 'east' ? 'not evaluated' : 'unknown'}`
        : declarations && !declarationsInspected
          ? `${title} · not inspected`
          : `${title} (${view.total})`;
    return (
      <BridgeSection
        position={position}
        title={heading}
        description={description}
        controls={
          <div className={styles.corridorPager}>
            {view.pageCount > 1 && (
              <>
                <Button
                  className={styles.compactButton}
                  disabled={view.page === 0}
                  aria-label={`Previous ${title.toLowerCase()} relationships`}
                  onClick={() => changePage(position, view.page - 1)}
                >
                  ‹
                </Button>
                <span aria-live="polite">
                  {view.start}–{view.end} of {view.total}
                </span>
                <Button
                  className={styles.compactButton}
                  disabled={view.page === view.pageCount - 1}
                  aria-label={`Next ${title.toLowerCase()} relationships`}
                  onClick={() => changePage(position, view.page + 1)}
                >
                  ›
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className={styles.cardStack} data-direction={position}>
          {view.slots.map((link, index) => {
            if (!link)
              return (
                <div
                  className={styles.corridorSlot}
                  data-empty="true"
                  aria-hidden="true"
                  key={`empty-${index}`}
                />
              );
            const relationship = relations.get(link.relationshipId)!;
            const endpoint =
              !declarations && link.endpointIds.length === 1
                ? entries.get(link.endpointIds[0]!)
                : undefined;
            const label = endpoint
              ? `${endpoint.name}${endpoint.kind === 'alias' ? ' · alias' : ''}`
              : relationship.label;
            const path = endpoint?.path
              ? displayPath(endpoint.path)
              : relationship.reference;
            const cardStatus = declarations
              ? 'Target not evaluated'
              : relationship.status.replaceAll('-', ' ');
            const active = relationship.id === activeRelationshipId;
            const incoming = position === 'north' || position === 'west';
            return (
              <div
                className={styles.corridorSlot}
                key={endpointId(position, link, 'card')}
              >
                <ArcherElement
                  id={endpointId(position, link, 'card')}
                  relations={
                    incoming
                      ? [
                          connection(
                            position,
                            endpointId(position, link, 'port'),
                            link,
                          ),
                        ]
                      : []
                  }
                >
                  <button
                    type="button"
                    className={styles.relationshipCard}
                    data-bridge={position}
                    data-slot={index}
                    data-active={active || undefined}
                    aria-pressed={active}
                    onClick={() => onPreview(link)}
                  >
                    <span className={styles.placeholderEyebrow}>
                      {relationship.kind.replaceAll('-', ' ')}
                    </span>
                    <strong title={label}>{label}</strong>
                    <code title={path}>{path}</code>
                    <span className={styles.cardStatus} title={cardStatus}>
                      {cardStatus}
                      {!declarations && link.endpointIds.length > 1
                        ? ` · ${link.endpointIds.length} endpoints`
                        : ''}
                    </span>
                  </button>
                </ArcherElement>
              </div>
            );
          })}
          {view.total === 0 && (
            <p className={styles.emptyBridge}>
              {declarations
                ? position === 'south' && !declarationsInspected
                  ? nativePrompt
                  : declarationEmptyLabels[position]
                : position === 'north'
                  ? 'No external incoming records supplied.'
                  : 'No references in this context.'}
            </p>
          )}
        </div>
      </BridgeSection>
    );
  }

  return (
    <CanvasPane
      back={
        <Button
          disabled={!canGoBack}
          aria-label={
            declarations
              ? 'Back to source evidence'
              : 'Back to previous resource'
          }
          className={styles.compactButton}
          onClick={onBack}
        >
          ←
        </Button>
      }
      location={
        <div className={styles.path}>
          <span className={styles.placeholderEyebrow}>
            {declarations
              ? applicationCenter
                ? 'Selected application / display name'
                : 'Selected file / display name'
              : 'Selected entry / exact location'}
          </span>
          <span>
            {declarations
              ? (selectedEntry?.name ?? 'Open an application or binary')
              : (selectedEntry?.path ?? 'Choose an inventory entry')}
          </span>
        </div>
      }
      context={
        <div className={styles.previewControls}>
          {actions}
          <label className={styles.selectLabel}>
            {declarations ? 'Architecture slice' : 'Architecture context'}
            <select
              value={contextId}
              onChange={(event) => onContextChange(event.target.value)}
            >
              {dataset.contexts.map((context) => (
                <option key={context.id} value={context.id}>
                  {context.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      }
      feedback={feedback}
      canvas={
        <BridgeViewport>
          <ArcherSurface
            className={styles.archerCanvas}
            style={{ height: 'auto' }}
            surfaceStyle={{ height: 'auto', overflow: 'visible' }}
            defaultArrowStyle={{ arrowLength: 6, strokeWidth: 1 }}
            svgElementProps={{ 'aria-hidden': true }}
          >
            <BridgeGrid
              showBoundary={!declarations}
              focusLabel={
                applicationCenter ? 'Selected application' : 'Selected file'
              }
              north={bridge('north')}
              west={bridge('west')}
              east={bridge('east')}
              south={bridge('south')}
              focus={
                <div className={styles.focusNode}>
                  <div className={styles.focusPlaceholder}>
                    <span className={styles.placeholderEyebrow}>
                      {declarations
                        ? applicationCenter
                          ? 'Selected application'
                          : 'Selected source file'
                        : 'Selected entry'}
                    </span>
                    <div className={styles.focusTitle}>
                      <span className={styles.fileGlyph} aria-hidden="true">
                        ▧
                      </span>
                      <div>
                        <strong title={selectedEntry?.name}>
                          {selectedEntry?.name ??
                            (declarations
                              ? 'Open an application or binary'
                              : 'Choose an entry')}
                        </strong>
                        <p>
                          {declarations
                            ? applicationCenter
                              ? 'Select an internal file to inspect'
                              : selectedEntry
                                ? 'Source file only'
                                : 'No Explorer scope selected'
                            : selectedEntry?.kind?.replaceAll('-', ' ')}
                        </p>
                      </div>
                    </div>
                    {!declarations && (
                      <code title={selectedEntry?.path}>
                        {selectedEntry?.path
                          ? displayPath(selectedEntry.path)
                          : undefined}
                      </code>
                    )}
                    <div className={styles.focusMeta}>
                      <span
                        title={
                          dataset.contexts.find(
                            (context) => context.id === contextId,
                          )?.label
                        }
                      >
                        {
                          dataset.contexts.find(
                            (context) => context.id === contextId,
                          )?.label
                        }
                      </span>
                      {declarations ? (
                        <span
                          title={
                            applicationName
                              ? 'Confirmed application navigation scope; dependency targets are not evaluated.'
                              : 'Standalone source; dependency targets are not evaluated.'
                          }
                        >
                          {applicationName
                            ? `Application: ${applicationName}`
                            : selectedEntry
                              ? 'Standalone binary'
                              : 'No scope selected'}
                        </span>
                      ) : (
                        <span title={rootEntry?.name}>
                          Scope: {rootEntry?.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {views.flatMap((view) =>
                    view.slots.map((link, index) => {
                      if (!link) return null;
                      const incoming =
                        view.position === 'north' || view.position === 'west';
                      return (
                        <div
                          className={styles.portSlot}
                          data-side={view.position}
                          data-slot={index}
                          style={{ '--port-index': index } as CSSProperties}
                          aria-hidden="true"
                          key={endpointId(view.position, link, 'port')}
                        >
                          <ArcherElement
                            id={endpointId(view.position, link, 'port')}
                            relations={
                              incoming
                                ? []
                                : [
                                    connection(
                                      view.position,
                                      endpointId(view.position, link, 'card'),
                                      link,
                                    ),
                                  ]
                            }
                          >
                            <span
                              className={styles.routingPort}
                              data-side={view.position}
                              data-active={
                                link.relationshipId === activeRelationshipId ||
                                undefined
                              }
                            />
                          </ArcherElement>
                        </div>
                      );
                    }),
                  )}
                </div>
              }
            />
          </ArcherSurface>
        </BridgeViewport>
      }
      legend={
        <div className={styles.legend} aria-label="Connection legend">
          {declarations ? (
            <span>
              <i
                className={`${styles.legendSwatch} ${styles.externalSwatch}`}
              />
              Declared reference · file target not evaluated
            </span>
          ) : (
            <>
              <span>
                <i
                  className={`${styles.legendSwatch} ${styles.incomingSwatch}`}
                />
                Bundle ingress
              </span>
              <span>
                <i className={styles.legendSwatch} />
                Bundle egress
              </span>
              <span>
                <i
                  className={`${styles.legendSwatch} ${styles.externalSwatch}`}
                />
                External / unresolved
              </span>
              <span>
                <i
                  className={`${styles.legendSwatch} ${styles.candidateSwatch}`}
                />
                Candidate / inferred
              </span>
            </>
          )}
        </div>
      }
      status={
        declarations
          ? !declarationsInspected
            ? nativePrompt
            : activeRelationshipId
              ? 'Previewing a declared reference. Its file target has not been evaluated.'
              : 'Select a declared reference to inspect its evidence. Target files and incoming references have not been evaluated.'
          : activeRelationshipId
            ? positions.some((position) =>
                allLinks[position].some(
                  (link) =>
                    link.relationshipId === activeRelationshipId &&
                    link.endpointIds.length > 0,
                ),
              )
              ? 'Previewing a relationship. Its direct endpoints are outlined in the tree; the center selection is unchanged.'
              : 'Previewing recorded evidence. This reference has no internal tree endpoint.'
            : 'Select a relationship to inspect its recorded evidence. Corridors show up to three relationships at a time.'
      }
    />
  );
}
