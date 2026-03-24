import { archiveJobAction } from '../jobs/actions';
import { getShortlistedJobs } from '../../../lib/queries';

export default async function ShortlistPage() {
  const jobs = await getShortlistedJobs();

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Shortlist</p>
        <h1>Kept for downstream handoff</h1>
        <p className="muted">These are the strongest current Scout outputs before Needle or application work picks them up.</p>
      </section>

      <section className="panel">
        {jobs.length === 0 ? (
          <p className="muted">Nothing shortlisted yet.</p>
        ) : (
          <ul className="simple-list job-list">
            {jobs.map((job) => (
              <li key={job.id} className="job-card">
                <div className="job-card-header">
                  <div>
                    <h2>{job.title}</h2>
                    <p className="muted">{job.companyName} · {job.locationText}</p>
                  </div>
                  <div className="badge success">Shortlisted</div>
                </div>

                <div className="stack-blocks small muted">
                  <div>Priority: {job.priorityScore?.toFixed(1) ?? '—'}</div>
                  <div>Work mode: {job.workMode ?? 'unknown'}</div>
                  {job.provenance ? <div>Source: {job.provenance.sourceKey}</div> : null}
                </div>

                {job.rationale ? <p>{job.rationale}</p> : null}

                <div className="button-row">
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
