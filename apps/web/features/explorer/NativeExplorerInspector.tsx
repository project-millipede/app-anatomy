import type { ByteString, Image, ImportedSymbol } from '@apple-code/browser';
import { ImportedSymbols, RecordedBytes } from '../workspace/DependencyDetails';
import {
  cpuLabel,
  machoValueLabel,
  rangeLabel,
} from '../workspace/reportPresentation';
import { InspectorPane } from './layout/InspectorPane';
import styles from './NativeExplorerInspector.module.css';

export type NativeInspectorSelection =
  { kind: 'source' } | { kind: 'library'; index: number };

function RecordedNames({
  title,
  names,
  empty,
}: {
  title: string;
  names: ByteString[];
  empty: string;
}) {
  return (
    <section>
      <h3>
        {title} ({names.length})
      </h3>
      {names.length === 0 ? (
        <p className={styles.note}>{empty}</p>
      ) : (
        <ol className={styles.names}>
          {names.map((name, index) => (
            <li key={index}>
              <RecordedBytes value={name} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Present native source/declaration evidence using only Rust-supplied associations. */
export function NativeExplorerInspector({
  image,
  selection,
}: {
  image: Image | undefined;
  selection: NativeInspectorSelection;
}) {
  const evidence = image?.dependencies;
  const library =
    selection.kind === 'library'
      ? evidence?.libraries[selection.index]
      : undefined;
  const imports = evidence
    ? Array.from<number, ImportedSymbol>(
        library?.importIndices ?? evidence.unassociatedImportIndices,
        (index) => evidence.imports[index]!,
      )
    : [];

  return (
    <InspectorPane
      header={
        <div className={`${styles.header} ${styles.shared}`}>
          <span className={styles.eyebrow}>
            {library ? 'Declared library reference' : 'Source evidence'}
          </span>
          <h2>
            {library
              ? library.name.display || '(empty library name)'
              : 'Selected file evidence'}
          </h2>
          <p>
            {library
              ? 'Recorded declaration · target not evaluated'
              : image
                ? cpuLabel(image.cpu)
                : 'Choose a native file and inspect its dependencies.'}
          </p>
        </div>
      }
      sections={
        <div className={`${styles.content} ${styles.shared}`}>
          <p className={styles.note}>
            Only the selected file is acquired. Declared references have no
            acquired target and do not add tree entries.
          </p>
          {!image ? (
            <p className={styles.note}>
              No inspected source slice is available.
            </p>
          ) : !evidence ? (
            <p className={styles.note}>
              This report contains header evidence only. Inspect dependencies to
              display declared libraries and imported-symbol associations.
            </p>
          ) : (
            <>
              {library ? (
                <section>
                  <h3>Recorded declaration</h3>
                  <RecordedBytes value={library.name} />
                  <dl className={styles.metadata}>
                    <div>
                      <dt>Library ordinal</dt>
                      <dd>{library.ordinal}</dd>
                    </div>
                    <div>
                      <dt>Load command</dt>
                      <dd>{machoValueLabel(library.command)}</dd>
                    </div>
                    <div>
                      <dt>Current version</dt>
                      <dd>{library.currentVersion}</dd>
                    </div>
                    <div>
                      <dt>Compatibility version</dt>
                      <dd>{library.compatibilityVersion}</dd>
                    </div>
                    <div>
                      <dt>Use flags</dt>
                      <dd>
                        {library.useFlags
                          ? machoValueLabel(library.useFlags)
                          : 'Not present'}
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : (
                <>
                  <section>
                    <h3>Source slice</h3>
                    <dl className={styles.metadata}>
                      <div>
                        <dt>File role</dt>
                        <dd>{machoValueLabel(image.fileType)}</dd>
                      </div>
                      <div>
                        <dt>Image byte range</dt>
                        <dd>{rangeLabel(image.fileRange)}</dd>
                      </div>
                      <div>
                        <dt>Declared libraries</dt>
                        <dd>{evidence.libraries.length.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Imported-symbol records</dt>
                        <dd>{evidence.imports.length.toLocaleString()}</dd>
                      </div>
                    </dl>
                  </section>
                  <RecordedNames
                    title="Install names"
                    names={evidence.installNames}
                    empty="No LC_ID_DYLIB declarations returned."
                  />
                  <RecordedNames
                    title="Runpath declarations"
                    names={evidence.runpaths}
                    empty="No LC_RPATH declarations returned."
                  />
                </>
              )}
              <section>
                <h3>Target not evaluated</h3>
                <p className={styles.note}>
                  Dependency target files and bundle locations have not been
                  evaluated.
                </p>
                <dl className={styles.metadata}>
                  <div>
                    <dt>Bundle location</dt>
                    <dd>Unknown</dd>
                  </div>
                  <div>
                    <dt>
                      {library ? 'Other consumers' : 'Incoming consumers'}
                    </dt>
                    <dd>Unknown</dd>
                  </div>
                </dl>
              </section>
              <section className={styles.symbols}>
                <h3>
                  {library
                    ? 'Imports associated with this declaration'
                    : 'Imports without a declared-library association'}
                </h3>
                {!library && (
                  <p className={styles.note}>
                    Rust preserves special, flat and unspecified provider
                    context in each record.
                  </p>
                )}
                <ImportedSymbols
                  key={library ? `library-${library.ordinal}` : 'unassociated'}
                  imports={imports}
                />
              </section>
            </>
          )}
        </div>
      }
      actions={null}
    />
  );
}
