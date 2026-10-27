'use client';

import { useId } from 'react';
import { Archer, type ArcherTypes, type ArrowStyle } from '@apple-code/archer';
import { Button } from '../workspace/ark/Button';
import { Placeholder } from './Placeholder';
import { BridgeGrid, BridgeViewport } from './layout/BridgeGrid';
import { BridgeSection, type BridgePosition } from './layout/BridgeSection';
import { CanvasPane } from './layout/CanvasPane';
import styles from './ExplorerLayout.module.css';

const { ArcherSurface, ArcherElement } = Archer;

const externalStyle: ArcherTypes.LineStyle = {
  strokeColor: 'var(--explorer-external)',
};

/** Anchors and line style for each bridge's illustrative connection. */
const bridgeConnections: Record<
  BridgePosition,
  Required<
    Pick<ArcherTypes.Relation, 'sourceAnchor' | 'targetAnchor' | 'style'>
  >
> = {
  north: {
    sourceAnchor: 'bottom',
    targetAnchor: 'top',
    style: externalStyle,
  },
  west: {
    sourceAnchor: 'right',
    targetAnchor: 'left',
    style: { strokeColor: 'var(--explorer-incoming)' },
  },
  east: {
    sourceAnchor: 'right',
    targetAnchor: 'left',
    style: { strokeColor: 'var(--explorer-outgoing)' },
  },
  south: {
    sourceAnchor: 'bottom',
    targetAnchor: 'top',
    style: { ...externalStyle, strokeDasharray: '5 4' },
  },
};

const defaultArrowStyle: ArrowStyle = {
  arrowLength: 6,
  strokeWidth: 1.5,
};

/**
 * Creates a preview connection with the chosen bridge's anchors and line style.
 *
 * @param position - The bridge crossed by this connection.
 * @param targetId - The Archer ID of the target resource.
 * @returns A relation configured for the preview canvas.
 */
function createPreviewRelation(
  position: BridgePosition,
  targetId: string,
): ArcherTypes.Relation {
  return {
    targetId,
    ...bridgeConnections[position],
    layout: 'default',
    pathStyle: 'smooth',
  };
}

/** Keep the existing illustrative Archer connections inside the layout slots. */
export function ExplorerRelationshipCanvas({
  selectedName,
  selectedPath,
}: {
  selectedName: string | undefined;
  selectedPath: string;
}) {
  const instanceId = useId();
  const selectedResourceId = `${instanceId}-selected-resource`;
  const internalTargetId = `${instanceId}-internal-target`;
  const externalReferenceId = `${instanceId}-external-reference`;

  return (
    <CanvasPane
      back={
        <Button disabled aria-label="Back to previous resource">
          ←
        </Button>
      }
      location={
        <div className={styles.path}>
          <span className={styles.placeholderEyebrow}>
            Preview selection / exact location
          </span>
          <span>{selectedPath}</span>
        </div>
      }
      context={<Button disabled>Architecture</Button>}
      canvas={
        <BridgeViewport>
          <ArcherSurface
            defaultArrowStyle={defaultArrowStyle}
            svgElementProps={{ 'aria-hidden': true }}
          >
            <BridgeGrid
              north={
                <BridgeSection
                  position="north"
                  title="External ingress"
                  description="Incoming external references"
                >
                  <ArcherElement
                    id={`${instanceId}-external-source`}
                    relations={[
                      createPreviewRelation('north', selectedResourceId),
                    ]}
                  >
                    <Placeholder title="External source" />
                  </ArcherElement>
                </BridgeSection>
              }
              west={
                <BridgeSection
                  position="west"
                  title="Bundle ingress"
                  description="Resources referencing this file"
                >
                  <ArcherElement
                    id={`${instanceId}-internal-source`}
                    relations={[
                      createPreviewRelation('west', selectedResourceId),
                    ]}
                  >
                    <Placeholder title="Internal source" />
                  </ArcherElement>
                </BridgeSection>
              }
              focus={
                <ArcherElement
                  id={selectedResourceId}
                  relations={[
                    createPreviewRelation('east', internalTargetId),
                    createPreviewRelation('south', externalReferenceId),
                  ]}
                >
                  <Placeholder
                    selected
                    title={selectedName ?? 'Choose a resource'}
                  />
                </ArcherElement>
              }
              east={
                <BridgeSection
                  position="east"
                  title="Bundle egress"
                  description="Internal targets and candidates"
                >
                  <ArcherElement id={internalTargetId}>
                    <Placeholder title="Internal target" />
                  </ArcherElement>
                </BridgeSection>
              }
              south={
                <BridgeSection
                  position="south"
                  title="External / unresolved egress"
                  description="System names, paths, and unknown targets"
                >
                  <ArcherElement id={externalReferenceId}>
                    <Placeholder title="External reference" />
                  </ArcherElement>
                </BridgeSection>
              }
            />
          </ArcherSurface>
        </BridgeViewport>
      }
      legend={
        <div className={styles.legend} aria-label="Connection legend">
          <span>
            <i className={`${styles.legendSwatch} ${styles.incomingSwatch}`} />{' '}
            Bundle ingress
          </span>
          <span>
            <i className={styles.legendSwatch} /> Bundle egress
          </span>
          <span>
            <i className={`${styles.legendSwatch} ${styles.externalSwatch}`} />{' '}
            External reference
          </span>
        </div>
      }
      status="Illustrative connections · No relationship analysis performed"
    />
  );
}
