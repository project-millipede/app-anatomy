'use client';

import { useId, type ReactNode } from 'react';
import { Archer, type ArcherTypes } from '@apple-code/archer';
import { Button } from '../workspace/ark/Button';
import { BridgeGrid, BridgeViewport } from './layout/BridgeGrid';
import { BridgeSection, type BridgePosition } from './layout/BridgeSection';
import { CanvasPane } from './layout/CanvasPane';
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

export function ExplorerRelationshipCanvas({
  dataset,
  selectedEntry,
  neighborhood,
  contextId,
  activeRelationshipId,
  canGoBack,
  onContextChange,
  onPreview,
  onBack,
  datasetSelector,
}: {
  dataset: PreviewDataset;
  selectedEntry: PreviewEntry | undefined;
  neighborhood: PreviewNeighborhood | undefined;
  contextId: string;
  activeRelationshipId: string | null;
  canGoBack: boolean;
  onContextChange: (id: string) => void;
  onPreview: (connection: PreviewConnection) => void;
  onBack: () => void;
  datasetSelector: ReactNode;
}) {
  const instanceId = useId();
  const selectedResourceId = `${instanceId}-selected-resource`;
  const relations = new Map(
    dataset.relationships.map((relationship) => [
      relationship.id,
      relationship,
    ]),
  );
  const entries = new Map(dataset.entries.map((entry) => [entry.id, entry]));
  const cardId = (id: string) => `${instanceId}-${id}`;

  function connection(
    position: BridgePosition,
    targetId: string,
    active: boolean,
  ): ArcherTypes.Relation {
    const incoming = position === 'north' || position === 'west';
    return {
      targetId,
      sourceAnchor: incoming
        ? position === 'north'
          ? 'bottom'
          : 'right'
        : position === 'south'
          ? 'bottom'
          : 'right',
      targetAnchor: incoming
        ? position === 'north'
          ? 'top'
          : 'left'
        : position === 'south'
          ? 'top'
          : 'left',
      layout: 'default',
      pathStyle: 'smooth',
      style: {
        strokeColor:
          position === 'west'
            ? 'var(--explorer-incoming)'
            : position === 'east'
              ? 'var(--explorer-outgoing)'
              : 'var(--explorer-external)',
        strokeWidth: active ? 2.5 : 1.5,
        ...(position === 'south' ? { strokeDasharray: '5 4' } : {}),
      },
    };
  }

  function bridge(position: BridgePosition) {
    const links = neighborhood?.[position] ?? [];
    const [title, description] = bridgeLabels[position];
    return (
      <BridgeSection
        position={position}
        title={`${title} (${links.length})`}
        description={description}
      >
        <div className={styles.cardStack}>
          {links.length === 0 && (
            <p className={styles.emptyBridge}>
              No{' '}
              {position === 'north'
                ? 'external incoming records supplied'
                : 'references in this context'}
              .
            </p>
          )}
          {links.map((link) => {
            const relationship = relations.get(link.relationshipId)!;
            const active = relationship.id === activeRelationshipId;
            const incoming = position === 'north' || position === 'west';
            return (
              <ArcherElement
                key={relationship.id}
                id={cardId(relationship.id)}
                relations={
                  incoming
                    ? [connection(position, selectedResourceId, active)]
                    : []
                }
              >
                <button
                  type="button"
                  className={styles.relationshipCard}
                  data-bridge={position}
                  data-active={active || undefined}
                  aria-pressed={active}
                  onClick={() => onPreview(link)}
                >
                  <span className={styles.placeholderEyebrow}>
                    {relationship.kind.replaceAll('-', ' ')}
                  </span>
                  <strong>
                    {link.endpointIds.length === 1
                      ? (entries.get(link.endpointIds[0]!)?.name ??
                        relationship.label)
                      : relationship.label}
                  </strong>
                  <code>{relationship.reference}</code>
                  <span className={styles.cardStatus}>
                    {relationship.status.replaceAll('-', ' ')}
                    {link.endpointIds.length > 1
                      ? ` · ${link.endpointIds.length} endpoints`
                      : ''}
                  </span>
                </button>
              </ArcherElement>
            );
          })}
        </div>
      </BridgeSection>
    );
  }

  const outgoing = positions.flatMap((position) =>
    position === 'east' || position === 'south'
      ? (neighborhood?.[position] ?? []).map((link) =>
          connection(
            position,
            cardId(link.relationshipId),
            link.relationshipId === activeRelationshipId,
          ),
        )
      : [],
  );

  return (
    <CanvasPane
      back={
        <Button
          disabled={!canGoBack}
          aria-label="Back to previous resource"
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
          {datasetSelector}
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
            defaultArrowStyle={{ arrowLength: 6, strokeWidth: 1.5 }}
            svgElementProps={{ 'aria-hidden': true }}
          >
            <BridgeGrid
              north={bridge('north')}
              west={bridge('west')}
              east={bridge('east')}
              south={bridge('south')}
              focus={
                <ArcherElement id={selectedResourceId} relations={outgoing}>
                  <div className={styles.focusPlaceholder}>
                    <span className={styles.placeholderEyebrow}>
                      Selected entry
                    </span>
                    <strong>{selectedEntry?.name ?? 'Choose an entry'}</strong>
                    <code>{selectedEntry?.path}</code>
                    <p>
                      {selectedEntry?.kind.replaceAll('-', ' ')} ·{' '}
                      {
                        dataset.contexts.find(
                          (context) => context.id === contextId,
                        )?.label
                      }
                    </p>
                    <p>
                      Static evidence · Candidate matching does not establish
                      runtime loading.
                    </p>
                  </div>
                </ArcherElement>
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
        </div>
      }
      status={
        activeRelationshipId
          ? positions.some((position) =>
              neighborhood?.[position].some(
                (link) =>
                  link.relationshipId === activeRelationshipId &&
                  link.endpointIds.length > 0,
              ),
            )
            ? 'Previewing a relationship. Its direct endpoints are outlined in the tree; the center selection is unchanged.'
            : 'Previewing recorded evidence. This reference has no internal tree endpoint.'
          : 'Select a relationship to inspect its recorded evidence and direct endpoints.'
      }
    />
  );
}
