import { archiveJobAction, runManualScoutIngestionAction, runSampleScoutPassAction, shortlistJobAction } from '../jobs/actions';
import { getInboxJobs } from '../../../lib/queries';

const manualScoutExample = JSON.stringify(
  [
    {
      sourceRecordId: 'manual-1',
      sourceUrl: 'https://jobs.example.com/acme-analytics-associate',
      companyName: 'Acme AI',
      title: 'Analytics Associate',
      locationText: 'New York, NY',
      description: 'SQL, experimentation, dashboards, and AI workflow analytics.',
      salaryText: '$85k-$100k',
      remote: false,
      hybrid: true,
    },
  ],
  null,
  2,
);

export default async function InboxPage() {
  const jobs = await getInboxJobs();

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Inbox</p>
        <h1>Discovery queue</h1>
        <p className="muted">Real Scout-backed jobs from Postgres. Ranked, deduped, and traceable back to source records.</p>

        <div className="button-row top-gap">
          <form action={runSampleScoutPassAction}>
            <button type="submit">Run sample Scout pass</button>
          </form>
        </div>

        <details className="details-block top-gap">
          <summary>Manual Scout ingest</summary>
          <form action={runManualScoutIngestionAction} className="stack-form form-panel top-gap">
            <div className="grid-two compact-grid">
              <label className="stack-field">
                <span>Source key</span>
                <input name="sourceKey" defaultValue="manual-scout" />
              </label>
              <label className="stack-field">
                <span>Search term</span>
                <input name="searchTerm" defaultValue="manual import" />
              </label>
            </div>
            <label className="stack-field">
              <span>Search location</span>
              <input name="searchLocation" defaultValue="manual" />
            </label>
            <label className="stack-field">
              <span>Records JSON</span>
              <textarea name="recordsJson" rows={12} defaultValue={manualScoutExample} />
            </label>
            <button type="submit">Ingest records into Scout</button>
          </form>
        </details>
      </section>

      <section className="panel">
        {jobs.length === 0 ? (
          <p className="muted">No discovered jobs yet.</p>
        ) : (
          <ul className="simple-list job-list">
            {jobs.map((job) => (
              <li key={job.id} className="job-card">
                <div className="job-card-header">
                  <div>
                    <h2>{job.title}</h2>
                    <p className="muted">{job.companyName} · {job.locationText}</p>
                  </div>
                  <div className="badge">Priority {job.priorityScore?.toFixed(1) ?? '—'}</div>
                </div>

                <div className="stack-blocks small muted">
                  <div>Status: {job.status}</div>
                  <div>Work mode: {job.workMode ?? 'unknown'}</div>
                  <div>Last seen: {job.lastSeenAt ? new Date(job.lastSeenAt).toLocaleString() : '—'}</div>
                  {job.provenance ? (
                    <div>
                      Source: {job.provenance.sourceKey}
                      {job.provenance.sourceUrl ? (
                        <>
                          {' '}· <a href={job.provenance.sourceUrl} target="_blank" rel="noreferrer" className="linkish">listing</a>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {job.rationale ? <p>{job.rationale}</p> : null}

                {job.topReasons.length > 0 ? (
                  <div>
                    <p className="eyebrow">Top reasons</p>
                    <ul className="chip-list">
                      {job.topReasons.map((reason) => (
                        <li key={reason} className="chip">{reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {job.risks.length > 0 ? (
                  <div>
                    <p className="eyebrow">Risks</p>
                    <ul className="chip-list">
                      {job.risks.map((risk) => (
                        <li key={risk} className="chip subtle">{risk}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="button-row">
                  <form action={shortlistJobAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <button type="submit">Shortlist</button>
                  </form>
                  <form action={archiveJobAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <button type="submit" className="button-link secondary">Archive</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
