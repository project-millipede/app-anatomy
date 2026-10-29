'use client';

import { useId, useState, type CSSProperties } from 'react';
import { Archer, type ArcherTypes } from '@apple-code/archer';
import { Button } from '../workspace/ark/Button';
import { BridgeGrid, BridgeViewport } from './layout/BridgeGrid';
import { BridgeSection, type BridgePosition } from './layout/BridgeSection';
import { CanvasPane } from './layout/CanvasPane';
import { CORRIDOR_CAPACITY, getCorridorPage } from './corridorLayout';
import type {
  PreviewDataset,
  PreviewEntry,
  PreviewNeighborhood,
  PreviewConnection,
} from './previewInventory';
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
const positions = ['north', 'west', 'east', 'south'] as const;
const firstPages: Record<BridgePosition, number> = {
  north: 0,
  west: 0,
  east: 0,
  south: 0,
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
}: {
  dataset: PreviewDataset;
  selectedEntry: PreviewEntry | undefined;
  neighborhood: PreviewNeighborhood | undefined;
  contextId: string;
  activeRelationshipId: string | null;
  canGoBack: boolean;
  onContextChange: (id: string) => void;
  onPreview: (connection: PreviewConnection) => void;
  onClearPreview: () => void;
  onBack: () => void;
}) {
  const instanceId = useId();
  const layoutKey = JSON.stringify([dataset.id, selectedEntry?.id, contextId]);
  const [pageState, setPageState] = useState({
    key: layoutKey,
    pages: firstPages,
  });
  const requestedPages =
    pageState.key === layoutKey ? pageState.pages : firstPages;
  const allLinks: Record<BridgePosition, readonly PreviewConnection[]> = {
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
  const rootEntry = dataset.entries.find((entry) => entry.parentId === null);
  const displayPath = (path: string) =>
    rootEntry && path.startsWith(`${rootEntry.path}/Contents/`)
      ? path.slice(`${rootEntry.path}/Contents/`.length)
      : path;
  const endpointId = (
    position: BridgePosition,
    link: PreviewConnection,
    kind: 'card' | 'port',
  ) =>
    `${instanceId}-${kind}-${encodeURIComponent(JSON.stringify([layoutKey, position, link.relationshipId]))}`;

  function connection(
    position: BridgePosition,
    targetId: string,
    link: PreviewConnection,
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
        ...((position === 'west' || position === 'east') &&
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
    const [title, description] = bridgeLabels[position];
    return (
      <BridgeSection
        position={position}
        title={`${title} (${view.total})`}
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
          {Array.from({ length: CORRIDOR_CAPACITY }, (_, index) => {
            const link = view.items[index];
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
              link.endpointIds.length === 1
                ? entries.get(link.endpointIds[0]!)
                : undefined;
            const label = endpoint
              ? `${endpoint.name}${endpoint.kind === 'alias' ? ' · alias' : ''}`
              : relationship.label;
            const path = endpoint
              ? displayPath(endpoint.path)
              : relationship.reference;
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
                    <span
                      className={styles.cardStatus}
                      title={relationship.status.replaceAll('-', ' ')}
                    >
                      {relationship.status.replaceAll('-', ' ')}
                      {link.endpointIds.length > 1
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
              {position === 'north'
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
          aria-label="Back to previous resource"
          className={styles.compactButton}
          onClick={onBack}
        >
          ←
        </Button>
      }
      location={
        <div className={styles.path}>
          <span className={styles.placeholderEyebrow}>
            Selected entry / exact location
          </span>
          <span>{selectedEntry?.path ?? 'Choose an inventory entry'}</span>
        </div>
      }
      context={
        <div className={styles.previewControls}>
          <label className={styles.selectLabel}>
            Architecture context
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
              north={bridge('north')}
              west={bridge('west')}
              east={bridge('east')}
              south={bridge('south')}
              focus={
                <div className={styles.focusNode}>
                  <div className={styles.focusPlaceholder}>
                    <span className={styles.placeholderEyebrow}>
                      Selected entry
                    </span>
                    <div className={styles.focusTitle}>
                      <span className={styles.fileGlyph} aria-hidden="true">
                        ▧
                      </span>
                      <div>
                        <strong title={selectedEntry?.name}>
                          {selectedEntry?.name ?? 'Choose an entry'}
                        </strong>
                        <p>{selectedEntry?.kind.replaceAll('-', ' ')}</p>
                      </div>
                    </div>
                    <code title={selectedEntry?.path}>
                      {selectedEntry
                        ? displayPath(selectedEntry.path)
                        : undefined}
                    </code>
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
                      <span title={rootEntry?.name}>
                        Scope: {rootEntry?.name}
                      </span>
                    </div>
                  </div>
                  {views.flatMap((view) =>
                    view.items.map((link, index) => {
                      const incoming =
                        view.position === 'north' || view.position === 'west';
                      return (
                        <div
                          className={styles.portSlot}
                          data-side={view.position}
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
          <span>
            <i className={`${styles.legendSwatch} ${styles.incomingSwatch}`} />
            Bundle ingress
          </span>
          <span>
            <i className={styles.legendSwatch} />
            Bundle egress
          </span>
          <span>
            <i className={`${styles.legendSwatch} ${styles.externalSwatch}`} />
            External / unresolved
          </span>
          <span>
            <i className={`${styles.legendSwatch} ${styles.candidateSwatch}`} />
            Candidate / inferred
          </span>
        </div>
      }
      status={
        activeRelationshipId
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
