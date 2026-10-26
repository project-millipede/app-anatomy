'use client';

import { useId } from 'react';
import { useTreeView, type UseTreeViewReturn } from '@ark-ui/react/tree-view';
import { Archer, type ArcherTypes, type ArrowStyle } from '@apple-code/archer';
import { Button } from '../workspace/ark/Button';
import { ExplorerFileTree } from './ExplorerFileTree';
import {
  defaultPreviewSelectionId,
  previewInventory,
  type PreviewNode,
} from './previewInventory';
import styles from './ExplorerLayout.module.css';

const { ArcherSurface, ArcherElement } = Archer;

const incomingStyle: ArcherTypes.LineStyle = {
  strokeColor: 'var(--explorer-incoming)',
};

const outgoingStyle: ArcherTypes.LineStyle = {
  strokeColor: 'var(--explorer-outgoing)',
};

const externalStyle: ArcherTypes.LineStyle = {
  strokeColor: 'var(--explorer-external)',
};

const unresolvedStyle: ArcherTypes.LineStyle = {
  ...externalStyle,
  strokeDasharray: '5 4',
};

const defaultArrowStyle: ArrowStyle = {
  arrowLength: 6,
  strokeWidth: 1.5,
};

/**
 * Creates a preview connection using the default layout and a smooth path.
 *
 * @param targetId - The Archer ID of the target resource.
 * @param sourceAnchor - The source side where the connection starts.
 * @param targetAnchor - The target side where the connection ends.
 * @param style - The line appearance for this connection.
 * @returns A relation configured for the preview canvas.
 */
function createPreviewRelation(
  targetId: string,
  sourceAnchor: ArcherTypes.TAnchorPosition,
  targetAnchor: ArcherTypes.TAnchorPosition,
  style: ArcherTypes.LineStyle,
): ArcherTypes.Relation {
  return {
    targetId,
    sourceAnchor,
    targetAnchor,
    style,
    layout: 'default',
    pathStyle: 'smooth',
  };
}

/**
 * Resolves the selected preview node and its display path through the tree.
 * Uses the selection prompt when no selected node can be found.
 *
 * @param tree - The preview tree's collection and current selected node IDs.
 * @returns The selected node (if found) and its path or selection prompt.
 */
function getPreviewSelection({
  collection,
  selectedValue,
}: Pick<UseTreeViewReturn<PreviewNode>, 'collection' | 'selectedValue'>) {
  const [selectedNodeId] = selectedValue;
  const selectedNode = selectedNodeId
    ? collection.findNode(selectedNodeId)
    : undefined;
  const selectedPath = selectedNode
    ? [...collection.getParentNodes(selectedNode.id), selectedNode]
        .map((node) => node.name)
        .join(' / ')
    : 'Choose a preview resource';

  return { selectedNode, selectedPath };
}

/** Interactive inventory preview; its authored arrows do not represent analysis. */
export function ExplorerLayout() {
  const instanceId = useId();
  const tree = useTreeView({
    collection: previewInventory,
    selectionMode: 'single',
    expandOnClick: false,
    defaultSelectedValue: [defaultPreviewSelectionId],
    defaultExpandedValue: previewInventory
      .getParentNodes(defaultPreviewSelectionId)
      .map((node) => node.id),
  });
  const { selectedNode, selectedPath } = getPreviewSelection(tree);
  const selectedResourceId = `${instanceId}-selected-resource`;
  const internalTargetId = `${instanceId}-internal-target`;
  const externalReferenceId = `${instanceId}-external-reference`;

  return (
    <main id="workbench" className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            ⌘
          </span>
          <div>
            <strong>CODE WORKBENCH</strong>
            <span>Application anatomy</span>
          </div>
        </div>
        <span className={styles.headerMeta}>
          Ark workspace · Layout preview
        </span>
      </header>

      <section
        className={styles.toolbar}
        aria-label="Application Explorer layout"
      >
        <div>
          <h1 className={styles.title}>Application Explorer</h1>
          <p>One selected resource. Four directions to explore.</p>
        </div>
        <div className={styles.toolbarActions} aria-label="Relationship axes">
          <span>↔ Internal resources</span>
          <span>↕ External / unresolved</span>
        </div>
      </section>

      <div className={styles.layoutNote}>
        Interactive preview · The tree uses authored example nodes. Evidence
        panels are placeholders; connections illustrate positioning only.
      </div>

      <div className={styles.workspace}>
        <ExplorerFileTree tree={tree} />

        <section
          className={styles.canvasPanel}
          aria-label="Relationship canvas preview"
        >
          <div className={styles.contextBar}>
            <Button disabled aria-label="Back to previous resource">
              ←
            </Button>
            <div className={styles.path}>
              <span className={styles.placeholderEyebrow}>
                Preview selection / exact location
              </span>
              <span>{selectedPath}</span>
            </div>
            <div className={styles.contextActions}>
              <Button disabled>Architecture</Button>
            </div>
          </div>

          <div
            className={styles.canvasViewport}
            role="region"
            aria-label="Four-bridge preview; scroll horizontally when needed"
            tabIndex={0}
          >
            <ArcherSurface
              className={styles.arrowSurface}
              defaultArrowStyle={defaultArrowStyle}
              svgElementProps={{ 'aria-hidden': true }}
            >
              <div className={styles.bridgeGrid}>
                <div className={styles.boundary} aria-hidden="true">
                  <span className={styles.boundaryLabel}>
                    Inside the application
                  </span>
                </div>

                <section
                  className={`${styles.bridge} ${styles.north}`}
                  aria-label="External ingress"
                >
                  <div className={styles.bridgeHeading}>
                    <span className={styles.compass}>N</span>
                    <div>
                      <h3>External ingress</h3>
                      <p className={styles.bridgeDescription}>
                        Incoming external references
                      </p>
                    </div>
                  </div>
                  <ArcherElement
                    id={`${instanceId}-external-source`}
                    relations={[
                      createPreviewRelation(
                        selectedResourceId,
                        'bottom',
                        'top',
                        externalStyle,
                      ),
                    ]}
                  >
                    <div className={styles.relationPlaceholder}>
                      <span className={styles.placeholderEyebrow}>
                        Connection placeholder
                      </span>
                      <strong>External source</strong>
                      <span
                        className={styles.placeholderLine}
                        aria-hidden="true"
                      />
                    </div>
                  </ArcherElement>
                </section>

                <section
                  className={`${styles.bridge} ${styles.west}`}
                  aria-label="Bundle ingress"
                >
                  <div className={styles.bridgeHeading}>
                    <span className={styles.compass}>W</span>
                    <div>
                      <h3>Bundle ingress</h3>
                      <p className={styles.bridgeDescription}>
                        Resources referencing this file
                      </p>
                    </div>
                  </div>
                  <ArcherElement
                    id={`${instanceId}-internal-source`}
                    relations={[
                      createPreviewRelation(
                        selectedResourceId,
                        'right',
                        'left',
                        incomingStyle,
                      ),
                    ]}
                  >
                    <div className={styles.relationPlaceholder}>
                      <span className={styles.placeholderEyebrow}>
                        Connection placeholder
                      </span>
                      <strong>Internal source</strong>
                      <span
                        className={styles.placeholderLine}
                        aria-hidden="true"
                      />
                    </div>
                  </ArcherElement>
                </section>

                <section
                  className={styles.focus}
                  aria-label="Selected preview resource"
                >
                  <ArcherElement
                    id={selectedResourceId}
                    relations={[
                      createPreviewRelation(
                        internalTargetId,
                        'right',
                        'left',
                        outgoingStyle,
                      ),
                      createPreviewRelation(
                        externalReferenceId,
                        'bottom',
                        'top',
                        unresolvedStyle,
                      ),
                    ]}
                  >
                    <div className={styles.focusPlaceholder}>
                      <span className={styles.placeholderEyebrow}>
                        Selected preview resource
                      </span>
                      <strong>
                        {selectedNode?.name ?? 'Choose a resource'}
                      </strong>
                      <p>File details placeholder</p>
                      <div
                        className={styles.placeholderLines}
                        aria-hidden="true"
                      >
                        <span className={styles.placeholderLine} />
                        <span className={styles.placeholderLine} />
                      </div>
                    </div>
                  </ArcherElement>
                </section>

                <section
                  className={`${styles.bridge} ${styles.east}`}
                  aria-label="Bundle egress"
                >
                  <div className={styles.bridgeHeading}>
                    <span className={styles.compass}>E</span>
                    <div>
                      <h3>Bundle egress</h3>
                      <p className={styles.bridgeDescription}>
                        Internal targets and candidates
                      </p>
                    </div>
                  </div>
                  <ArcherElement id={internalTargetId}>
                    <div className={styles.relationPlaceholder}>
                      <span className={styles.placeholderEyebrow}>
                        Connection placeholder
                      </span>
                      <strong>Internal target</strong>
                      <span
                        className={styles.placeholderLine}
                        aria-hidden="true"
                      />
                    </div>
                  </ArcherElement>
                </section>

                <section
                  className={`${styles.bridge} ${styles.south}`}
                  aria-label="External or unresolved egress"
                >
                  <div className={styles.bridgeHeading}>
                    <span className={styles.compass}>S</span>
                    <div>
                      <h3>External / unresolved egress</h3>
                      <p className={styles.bridgeDescription}>
                        System names, paths, and unknown targets
                      </p>
                    </div>
                  </div>
                  <ArcherElement id={externalReferenceId}>
                    <div className={styles.relationPlaceholder}>
                      <span className={styles.placeholderEyebrow}>
                        Connection placeholder
                      </span>
                      <strong>External reference</strong>
                      <span
                        className={styles.placeholderLine}
                        aria-hidden="true"
                      />
                    </div>
                  </ArcherElement>
                </section>
              </div>
            </ArcherSurface>
          </div>

          <div className={styles.legend} aria-label="Connection legend">
            <span>
              <i
                className={`${styles.legendSwatch} ${styles.incomingSwatch}`}
              />{' '}
              Bundle ingress
            </span>
            <span>
              <i className={styles.legendSwatch} /> Bundle egress
            </span>
            <span>
              <i
                className={`${styles.legendSwatch} ${styles.externalSwatch}`}
              />{' '}
              External reference
            </span>
          </div>
          <p className={styles.status}>
            Illustrative connections · No relationship analysis performed
          </p>
        </section>

        <aside
          className={styles.inspector}
          aria-label="Connection inspector placeholder"
        >
          <div className={styles.inspectorHeader}>
            <span className={styles.placeholderEyebrow}>
              Connection details
            </span>
            <h2>Evidence inspector</h2>
            <p>The selected connection will be explained here.</p>
          </div>
          <div className={styles.inspectorBody}>
            {[
              'Original reference',
              'Resolution context',
              'Endpoint status',
            ].map((label) => (
              <section className={styles.inspectorSection} key={label}>
                <h3>{label}</h3>
                <div className={styles.placeholderLines} aria-hidden="true">
                  <span className={styles.placeholderLine} />
                  <span className={styles.placeholderLine} />
                  <span className={styles.placeholderLine} />
                </div>
              </section>
            ))}
          </div>
          <div className={styles.inspectorActions}>
            <Button disabled>Reveal endpoint</Button>
            <Button disabled>Focus endpoint</Button>
          </div>
        </aside>
      </div>

      <footer className={styles.footer}>
        <span>Application Explorer · Layout preview</span>
        <span>Illustrative connections · No files inspected</span>
      </footer>
    </main>
  );
}
