import Link from 'next/link';

import { getShortlistedJobs } from '../../../lib/queries';

function formatPostingStatus(value: string | null | undefined) {
  if (!value) {
    return 'not checked';
  }

  return value.replaceAll('_', ' ');
}

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
                  <div>Posting: {formatPostingStatus(job.latestPostingCheck?.status)}</div>
                  {job.provenance ? <div>Source: {job.provenance.sourceKey}</div> : null}
                </div>

                {job.rationale ? <p>{job.rationale}</p> : null}

                <div className="button-row">
                  <Link href={`/jobs/${job.id}`} className="button-link secondary">
                    Details
                  </Link>
                  <form method="post" action={`/api/actions/jobs/${job.id}/verify-posting?next=/shortlist`}>
                    <button type="submit" className="button-link secondary">Verify posting</button>
                  </form>
                  {job.activeApplication ? (
                    <Link
                      href={job.activeApplication.status === 'applying' || job.activeApplication.status === 'submit_review' || job.activeApplication.status === 'submitted'
                        ? `/applications/${job.activeApplication.id}`
                        : `/tailoring/${job.activeApplication.id}`}
                      className="button-link"
                    >
                      Open {job.activeApplication.status.replaceAll('_', ' ')}
                    </Link>
                  ) : job.latestPostingCheck && (job.latestPostingCheck.status === 'dead' || job.latestPostingCheck.status === 'uncertain') ? (
                    <span className="muted small">Re-verify before starting</span>
                  ) : (
                    <form method="get" action={`/api/actions/jobs/${job.id}/start`}>
                      <button type="submit">Start application</button>
                    </form>
                  )}
                  <form method="post" action={`/api/actions/jobs/${job.id}/archive?next=/shortlist`}>
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
