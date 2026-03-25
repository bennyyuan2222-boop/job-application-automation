import { getRecentScoutRuns } from '@job-ops/read-models';

export const dynamic = 'force-dynamic';

function formatDuration(startedAtIso: string, completedAtIso: string | null) {
  if (!completedAtIso) {
    return 'In progress';
  }

  const durationMs = new Date(completedAtIso).getTime() - new Date(startedAtIso).getTime();
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return 'Completed';
  }

  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
}

function formatSearchLabel(searchTerm: string | null, searchLocation: string | null) {
  const parts = [searchTerm, searchLocation].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(' · ') : 'Unspecified search';
}

export default async function ScoutRunsPage() {
  const runs = await getRecentScoutRuns(25);

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Scout lane</p>
        <h1>Recent Scout runs</h1>
        <p className="muted">
          A lightweight ops surface for discovery runs: trigger type, structured counts, and whether the run completed,
          partially completed, or reused an earlier idempotent pass.
        </p>
      </section>

      <section className="panel">
        {runs.length === 0 ? (
          <p className="muted">No Scout runs recorded yet.</p>
        ) : (
          <ul className="timeline-list">
            {runs.map((run) => {
              const errorCount = Array.isArray(run.errorSummaryJson) ? run.errorSummaryJson.length : 0;

              return (
                <li key={run.id} className="timeline-item">
                  <div>
                    <strong>{formatSearchLabel(run.searchTerm, run.searchLocation)}</strong>
                    <div className="muted small">
                      {run.sourceKey} · trigger {run.triggerType} · status {run.status}
                    </div>
                    <div className="muted small">
                      fetched {run.fetchedCount} · captured {run.capturedCount} · normalized {run.normalizedCount} · rejected{' '}
                      {run.rejectedCount} · errored {run.erroredCount} · created {run.createdJobCount} · deduped{' '}
                      {run.dedupedCount}
                    </div>
                    {run.idempotencyKey ? <div className="muted small">idempotency: {run.idempotencyKey}</div> : null}
                    {run.notes ? <div className="muted small">{run.notes}</div> : null}
                    {errorCount > 0 ? <div className="muted small">error summaries: {errorCount}</div> : null}
                  </div>
                  <div className="muted small right-align">
                    <div>{new Date(run.startedAt).toLocaleString()}</div>
                    <div>{formatDuration(run.startedAt, run.completedAt)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
