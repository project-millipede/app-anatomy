import { Button } from '../workspace/ark/Button';
import { InspectorPane } from './layout/InspectorPane';
import type { PreviewDataset, PreviewRelationship } from './previewInventory';
import styles from './ExplorerLayout.module.css';

/** Evidence and endpoint actions for one Rust-computed relationship. */
export function ExplorerConnectionInspector({
  dataset,
  relationship,
  endpointIds,
  candidateId,
  incoming,
  onChooseCandidate,
  onReveal,
  onFocus,
}: {
  dataset: PreviewDataset;
  relationship: PreviewRelationship | undefined;
  endpointIds: readonly string[];
  candidateId: string | null;
  incoming: boolean;
  onChooseCandidate: (id: string) => void;
  onReveal: () => void;
  onFocus: () => void;
}) {
  const entries = new Map(dataset.entries.map((entry) => [entry.id, entry]));
  const endpoint = candidateId ? entries.get(candidateId) : undefined;
  const endpointName = incoming ? 'source' : 'target';
  const canNavigate = Boolean(endpoint);
  const source = relationship ? entries.get(relationship.sourceId) : undefined;
  const sourceName = source
    ? `${source.name}${source.kind === 'alias' ? ' (alias)' : ''}`
    : undefined;
  const targetNames =
    relationship?.targetIds.map((id) => entries.get(id)?.name ?? id) ?? [];
  const heading = sourceName
    ? `${sourceName} → ${targetNames.length === 1 ? targetNames[0] : targetNames.length > 1 ? `${targetNames.length} candidates` : relationship?.reference}`
    : relationship?.label;

  return (
    <InspectorPane
      header={
        <div className={styles.inspectorHeading}>
          <span className={styles.placeholderEyebrow}>
            Connection details · outside the graph
          </span>
          <h2>{heading ?? 'Evidence inspector'}</h2>
          <p>
            {relationship
              ? relationship.kind.replaceAll('-', ' ')
              : 'Choose a relationship card. One file stays selected at the center.'}
          </p>
        </div>
      }
      sections={
        relationship ? (
          <>
            <section className={styles.inspectorSection}>
              <h3>Recorded evidence</h3>
              <code className={styles.evidenceBlock}>
                {relationship.reference}
              </code>
              {relationship.evidence.map((item, index) => (
                <div key={`${item.label}-${index}`}>
                  <strong>{item.label}</strong>
                  <p>{item.value}</p>
                </div>
              ))}
            </section>
            <section className={styles.inspectorSection}>
              <h3>Resolution / interpretation context</h3>
              <p className={styles.cardStatus}>
                {relationship.status.replaceAll('-', ' ')}
              </p>
              {relationship.note && <p>{relationship.note}</p>}
              {relationship.context.map((item, index) => (
                <div key={`${item.label}-${index}`}>
                  <strong>{item.label}</strong>
                  <p>{item.value}</p>
                </div>
              ))}
              {relationship.aliasChain.length > 0 && (
                <div>
                  <strong>Alias chain</strong>
                  <ol className={styles.aliasChain}>
                    {relationship.aliasChain.map((item, index) => (
                      <li key={index}>
                        <code>{item}</code>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
            <section className={styles.inspectorSection}>
              <h3>Endpoint status</h3>
              {endpointIds.length > 1 && (
                <p>
                  Choose a candidate before revealing or focusing an endpoint.
                </p>
              )}
              {endpointIds.map((id) => {
                const entry = entries.get(id);
                const candidate = relationship.candidates.find(
                  (value) => value.entryId === id,
                );
                return (
                  <label className={styles.candidateOption} key={id}>
                    <input
                      type="radio"
                      name="explorer-endpoint"
                      value={id}
                      checked={candidateId === id}
                      onChange={() => onChooseCandidate(id)}
                    />
                    <span>
                      <strong>{entry?.name ?? id}</strong>
                      <code>{entry?.path ?? id}</code>
                      {candidate && <small>{candidate.reason}</small>}
                    </span>
                  </label>
                );
              })}
              {endpointIds.length === 0 && (
                <p>
                  {relationship.externalEndpoint ??
                    'No represented internal endpoint. Unresolved references do not create files in the tree.'}
                </p>
              )}
              {endpoint && (
                <p className={styles.endpointSummary}>
                  Active {endpointName}: {endpoint.path}
                </p>
              )}
            </section>
            {relationship.suggestedEntryId && (
              <section className={styles.inspectorSection}>
                <h3>Suggested replacement · annotation only</h3>
                <code className={styles.evidenceBlock}>
                  {entries.get(relationship.suggestedEntryId)?.path ??
                    relationship.suggestedEntryId}
                </code>
                <p>
                  This suggestion is not a resolved endpoint and does not
                  activate a tree resource.
                </p>
              </section>
            )}
            {relationship.attempts.length > 0 && (
              <section className={styles.inspectorSection}>
                <h3>Candidate attempts</h3>
                <ul className={styles.attempts}>
                  {relationship.attempts.map((attempt, index) => (
                    <li key={index}>
                      <code>{attempt.path}</code>
                      {attempt.finalPath &&
                        attempt.finalPath !== attempt.path && (
                          <span>
                            Evaluated location: <code>{attempt.finalPath}</code>
                          </span>
                        )}
                      <span>
                        {attempt.status.replaceAll('-', ' ')} · {attempt.reason}
                        {attempt.note ? ` · ${attempt.note}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <p className={styles.muted}>
            The synthetic inventory supplies evidence and candidate results
            computed by Rust. No files have been inspected.
          </p>
        )
      }
      actions={
        <>
          <Button
            className={styles.compactButton}
            disabled={!canNavigate}
            onClick={onReveal}
          >
            Reveal {endpointName}
          </Button>
          <Button
            className={styles.compactButton}
            disabled={!canNavigate}
            onClick={onFocus}
          >
            Focus {endpointName} →
          </Button>
        </>
      }
    />
  );
}
