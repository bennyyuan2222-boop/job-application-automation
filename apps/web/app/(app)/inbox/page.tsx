import Link from 'next/link';

import { type ScoutQueueJob } from '@job-ops/contracts';
import { getInboxScoutJobs } from '@job-ops/read-models';

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 'n/a';
  }

  return `${Math.round(value * 100)}%`;
}

export default async function InboxPage() {
  const jobs = await getInboxScoutJobs();
  const needsHumanReview = jobs.filter((job) => job.latestDecision?.verdict === 'needs_human_review');
  const otherDiscovered = jobs.filter((job) => job.latestDecision?.verdict !== 'needs_human_review');

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Scout lane</p>
        <h1>Inbox</h1>
        <p className="muted">
          Fresh discovered jobs with Scout’s latest verdict, confidence, reasons, and ambiguity flags. Manual shortlist or
          archive actions are recorded as Scout feedback/overrides.
        </p>
      </section>

      <section className="panel">
        <h2>Needs human review</h2>
        <p className="muted">Scout flagged these as ambiguous enough that you should decide.</p>
        <JobList jobs={needsHumanReview} emptyMessage="No ambiguous jobs right now." />
      </section>

      <section className="panel">
        <h2>Other discovered jobs</h2>
        <p className="muted">These are still discovered jobs, but Scout’s latest verdict is not `needs_human_review`.</p>
        <JobList jobs={otherDiscovered} emptyMessage="No other discovered jobs in the Inbox." />
      </section>
    </div>
  );
}

function JobList({ jobs, emptyMessage }: { jobs: ScoutQueueJob[]; emptyMessage: string }) {
  if (jobs.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {jobs.map((job) => {
        const decision = job.latestDecision;
        return (
          <article key={job.id} className="panel" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0 }}>{job.title}</h3>
                <p className="muted" style={{ marginTop: '.35rem' }}>
                  {job.companyName} · {job.locationText}
                </p>
              </div>
              <div className="muted small" style={{ textAlign: 'right' }}>
                <div>priority {job.priorityScore ?? 'n/a'}</div>
                <div>status {job.status}</div>
              </div>
            </div>

            {decision ? (
              <div style={{ marginTop: '1rem', display: 'grid', gap: '.5rem' }}>
                <div>
                  <strong>Scout verdict:</strong> {decision.verdict}
                  {decision.actedAutomatically ? ' · auto-acted' : ' · awaiting human decision'}
                </div>
                <div className="muted small">
                  confidence {formatConfidence(decision.confidence)} · policy {decision.policyVersion}
                </div>
                {decision.reasons.length > 0 ? (
                  <div>
                    <div className="small" style={{ fontWeight: 600 }}>
                      Reasons
                    </div>
                    <ul style={{ marginTop: '.35rem', paddingLeft: '1.2rem' }}>
                      {decision.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {decision.ambiguityFlags.length > 0 ? (
                  <div>
                    <div className="small" style={{ fontWeight: 600 }}>
                      Ambiguity flags
                    </div>
                    <div className="muted small" style={{ marginTop: '.35rem' }}>
                      {decision.ambiguityFlags.join(' · ')}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="muted" style={{ marginTop: '1rem' }}>
                No Scout decision recorded yet.
              </p>
            )}

            <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <Link href={`/jobs/${job.id}`} className="button-link secondary">
                Details
              </Link>
              <form method="post" action={`/api/actions/jobs/${job.id}/shortlist?next=/inbox`}>
                <button type="submit">Shortlist</button>
              </form>
              <form method="post" action={`/api/actions/jobs/${job.id}/archive?next=/inbox`}>
                <button type="submit">Archive</button>
              </form>
            </div>
          </article>
        );
      })}
    </div>
  );
}
