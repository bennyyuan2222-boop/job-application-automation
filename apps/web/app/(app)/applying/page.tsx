import Link from 'next/link';

import { getApplyingQueue } from '../../../lib/queries';

export default async function ApplyingPage() {
  const applications = await getApplyingQueue();

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Applying</p>
        <h1>Latch operating queue</h1>
        <p className="muted">
          This is the first real Latch slice: visible readiness, field-level answers, attachment safety, and portal-session
          tracking without browser automation.
        </p>
      </section>

      <section className="panel">
        {applications.length === 0 ? (
          <p className="muted">No applying-state applications yet.</p>
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
                      {application.portalDomain ?? 'portal not set'} · updated{' '}
                      {new Date(application.updatedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="queue-metrics">
                    <div className="metric-chip">
                      <span>Completion</span>
                      <strong>{application.completionPercent}%</strong>
                    </div>
                    <div className="metric-chip">
                      <span>Missing required</span>
                      <strong>{application.missingRequiredCount}</strong>
                    </div>
                    <div className="metric-chip">
                      <span>Low confidence</span>
                      <strong>{application.lowConfidenceCount}</strong>
                    </div>
                    <div className={`status-pill ${application.hasHardBlockers ? 'danger' : 'ok'}`}>
                      {application.hasHardBlockers ? 'Blocked' : 'Ready path'}
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
