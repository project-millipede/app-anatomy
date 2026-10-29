import { useState } from 'react';
import type {
  ByteString,
  DependencyEvidence,
  ImportedSymbol,
} from '@apple-code/browser';
import { machoValueLabel } from './reportPresentation';
import styles from './DependencyDetails.module.css';

const SYMBOL_PAGE_SIZE = 50;

/** Render Rust's display text alongside the original bytes without interpreting either. */
function RecordedBytes({ value }: { value: ByteString }) {
  return (
    <>
      <code className={styles.recordedName}>{value.display || '(empty)'}</code>
      <details className={styles.rawBytes}>
        <summary>Raw bytes ({value.bytes.length})</summary>
        <code>
          {Array.from(value.bytes, (byte) =>
            byte.toString(16).padStart(2, '0'),
          ).join(' ') || '(empty)'}
        </code>
      </details>
    </>
  );
}

/** Show the raw generated fields; special-ordinal meanings come from Rust's association label. */
function rawImportFlags(flags: ImportedSymbol['flags']): string {
  switch (flags.tag) {
    case 'none':
      return 'None';
    case 'mach-o':
      return `n_type 0x${flags.val.nType.toString(16)} · n_desc 0x${flags.val.nDesc.toString(16)}`;
    case 'mach-o-bind':
      return `dylib ${flags.val.dylib} · flags 0x${flags.val.flags.toString(16)}`;
    case 'other':
      return flags.val;
  }
}

/** Bound rendered symbol rows while retaining their original order and Rust associations. */
function ImportedSymbols({ imports }: { imports: ImportedSymbol[] }) {
  const [requestedPage, setRequestedPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(imports.length / SYMBOL_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount - 1);
  const offset = page * SYMBOL_PAGE_SIZE;
  const visible = imports.slice(offset, offset + SYMBOL_PAGE_SIZE);

  return (
    <section>
      <h4>Imported symbols ({imports.length.toLocaleString()})</h4>
      {imports.length === 0 ? (
        <p>No imported-symbol records returned.</p>
      ) : (
        <>
          <div className={styles.pagination}>
            <span role="status">
              Symbols {(offset + 1).toLocaleString()}–
              {(offset + visible.length).toLocaleString()} of{' '}
              {imports.length.toLocaleString()}
            </span>
            <div>
              <button
                type="button"
                className={styles.pageButton}
                disabled={page === 0}
                onClick={() => setRequestedPage(page - 1)}
              >
                Previous symbols
              </button>
              <button
                type="button"
                className={styles.pageButton}
                disabled={page === pageCount - 1}
                onClick={() => setRequestedPage(page + 1)}
              >
                Next symbols
              </button>
            </div>
          </div>
          <ol className={styles.symbols} start={offset + 1}>
            {visible.map((symbol, index) => (
              <li key={offset + index}>
                <RecordedBytes value={symbol.name} />
                <p className={styles.association}>{symbol.association}</p>
                <details className={styles.importMetadata}>
                  <summary>Recorded import metadata</summary>
                  <dl className={styles.metadata}>
                    <div>
                      <dt>Recorded library</dt>
                      <dd>
                        <RecordedBytes value={symbol.library} />
                      </dd>
                    </div>
                    <div>
                      <dt>Weak symbol</dt>
                      <dd>{symbol.weak ? 'Yes' : 'No'}</dd>
                    </div>
                    <div>
                      <dt>Raw flags</dt>
                      <dd>
                        <code>{rawImportFlags(symbol.flags)}</code>
                      </dd>
                    </div>
                  </dl>
                </details>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Shared Base/Ark presentation of this slice's declared dependency facts. */
export function DependencyDetails({
  evidence,
}: {
  evidence: DependencyEvidence;
}) {
  return (
    <section className={styles.section} aria-label="Dependency evidence">
      <h3>Dependency evidence</h3>
      <p className={styles.note}>
        These are recorded library declarations and symbol associations. No
        filesystem target or runtime load is established.
      </p>
      <section>
        <h4>Declared libraries ({evidence.libraries.length})</h4>
        {evidence.libraries.length === 0 ? (
          <p>No declared library load commands.</p>
        ) : (
          evidence.libraries.map((library) => (
            <article className={styles.library} key={library.ordinal}>
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
            </article>
          ))
        )}
      </section>
      <section>
        <h4>Runpath declarations ({evidence.runpaths.length})</h4>
        {evidence.runpaths.length === 0 ? (
          <p>No LC_RPATH commands.</p>
        ) : (
          <ol className={styles.names}>
            {evidence.runpaths.map((path, index) => (
              <li key={index}>
                <RecordedBytes value={path} />
              </li>
            ))}
          </ol>
        )}
      </section>
      <section>
        <h4>Install names ({evidence.installNames.length})</h4>
        {evidence.installNames.length === 0 ? (
          <p>No LC_ID_DYLIB commands.</p>
        ) : (
          <ol className={styles.names}>
            {evidence.installNames.map((name, index) => (
              <li key={index}>
                <RecordedBytes value={name} />
              </li>
            ))}
          </ol>
        )}
      </section>
      <ImportedSymbols imports={evidence.imports} />
    </section>
  );
}
