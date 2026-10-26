'use client';

import { useId } from 'react';
import { Archer, type ArcherTypes } from '@apple-code/archer';
import { Button } from '../workspace/ark/Button';
import styles from './ExplorerLayout.module.css';

const { ArcherSurface, ArcherElement } = Archer;

const incomingStyle = { strokeColor: 'var(--explorer-incoming)' };
const outgoingStyle = { strokeColor: 'var(--explorer-outgoing)' };
const externalStyle = { strokeColor: 'var(--explorer-external)' };
const unresolvedStyle = {
  ...externalStyle,
  strokeDasharray: '5 4',
};
const defaultArrowStyle = { arrowLength: 6, strokeWidth: 1.5 };

/** Structural Explorer preview; its authored arrows do not represent analysis. */
export function ExplorerLayout() {
  const instance = useId();
  const centerId = `${instance}-selected-resource`;
  const eastId = `${instance}-internal-target`;
  const southId = `${instance}-external-reference`;

  const relation = (
    targetId: string,
    sourceAnchor: ArcherTypes.TAnchorPosition,
    targetAnchor: ArcherTypes.TAnchorPosition,
    style: ArcherTypes.LineStyle,
  ): ArcherTypes.Relation => ({
    targetId,
    sourceAnchor,
    targetAnchor,
    style,
    layout: 'default',
    pathStyle: 'smooth',
  });

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
        Layout preview · File navigation and evidence panels are placeholders.
        Connections below illustrate positioning only.
      </div>

      <div className={styles.workspace}>
        <aside
          className={styles.sidebar}
          aria-label="File navigation placeholder"
        >
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Files</h2>
            <span className={styles.muted}>Inventory</span>
          </div>
          <div
            className={styles.treeLegend}
            aria-label="Planned tree highlights"
          >
            <span className={styles.legendItem}>
              <i className={styles.selectedDot} /> Selected
            </span>
            <span className={styles.legendItem}>
              <i className={styles.incomingDot} /> IN
            </span>
            <span className={styles.legendItem}>
              <i className={styles.outgoingDot} /> OUT
            </span>
          </div>
          <div className={styles.treeBody}>
            <p className={styles.placeholderEyebrow}>
              Ark Tree View placeholder
            </p>
            <div className={styles.treePlaceholderRow}>
              <span aria-hidden="true">▾</span> Application
            </div>
            <div className={styles.treeIndent}>
              <div className={styles.treePlaceholderRow}>
                <span aria-hidden="true">▾</span> Contents
              </div>
              <div className={styles.treeIndent}>
                <div className={styles.treePlaceholderRow}>
                  <span aria-hidden="true">▸</span> Resources
                </div>
                <div className={styles.treePlaceholderRow}>
                  <span aria-hidden="true">▾</span> Frameworks
                </div>
                <div className={styles.treeIndent}>
                  <div className={styles.treePlaceholderRow} data-selected>
                    Selected resource
                  </div>
                  <div className={styles.placeholderLines} aria-hidden="true">
                    <span className={styles.placeholderLine} />
                    <span className={styles.placeholderLine} />
                    <span className={styles.placeholderLine} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.sidebarFooter}>
            <p>Physical containment</p>
            <Button disabled>Locate selection</Button>
          </div>
        </aside>

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
                Selected file / exact location
              </span>
              <span>Application / … / Selected resource</span>
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
                    id={`${instance}-external-source`}
                    relations={[
                      relation(centerId, 'bottom', 'top', externalStyle),
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
                    id={`${instance}-internal-source`}
                    relations={[
                      relation(centerId, 'right', 'left', incomingStyle),
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
                  aria-label="Selected resource placeholder"
                >
                  <ArcherElement
                    id={centerId}
                    relations={[
                      relation(eastId, 'right', 'left', outgoingStyle),
                      relation(southId, 'bottom', 'top', unresolvedStyle),
                    ]}
                  >
                    <div className={styles.focusPlaceholder}>
                      <span className={styles.placeholderEyebrow}>
                        Selected resource
                      </span>
                      <strong>One file at the center</strong>
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
                  <ArcherElement id={eastId}>
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
                  <ArcherElement id={southId}>
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
              <i
                className={`${styles.legendSwatch} ${styles.outgoingSwatch}`}
              />{' '}
              Bundle egress
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
