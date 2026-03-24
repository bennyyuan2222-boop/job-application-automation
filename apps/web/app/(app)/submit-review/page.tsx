import Link from 'next/link';

import { getSubmitReviewQueue } from '../../../lib/queries';

export default async function SubmitReviewPage() {
  const applications = await getSubmitReviewQueue();

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Submit Review</p>
        <h1>Human final-check queue</h1>
        <p className="muted">Applications that are ready for Benny’s final live review or already marked submitted.</p>
      </section>

      <section className="panel">
        {applications.length === 0 ? (
          <p className="muted">No applications in submit review yet.</p>
        ) : (
          <div className="table-like-list">
            {applications.map((application) => (
              <Link key={application.id} href={`/applications/${application.id}`} className="queue-card-link">
                <article className="queue-card">
                  <div>
                    <div className="eyebrow">{application.status.replaceAll('_', ' ')}</div>
                    <h2>
                      {application.jobTitle} · {application.companyName}
                    </h2>
                    <p className="muted small">
                      {application.portalDomain ?? 'portal not set'} · updated {new Date(application.updatedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="queue-metrics">
                    <div className="metric-chip">
                      <span>Completion</span>
                      <strong>{application.completionPercent}%</strong>
                    </div>
                    <div className={`status-pill ${application.status === 'submitted' ? 'ok' : application.hasHardBlockers ? 'danger' : 'warning'}`}>
                      {application.status === 'submitted' ? 'Submitted' : application.hasHardBlockers ? 'Blocked' : 'Needs final review'}
                    </div>
                  </div>

                  <div className="muted small">
                    Tailored resume: {application.selectedTailoredResumeTitle ?? 'not selected'}
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
