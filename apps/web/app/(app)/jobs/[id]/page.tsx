import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getScoutJobDetail } from '@job-ops/read-models';

function formatConfidence(value: number | null | undefined) {
  if (typeof value !== 'number') {
    return 'n/a';
  }

  return `${Math.round(value * 100)}%`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function applicationRouteForStatus(applicationId: string, status: string) {
  if (status === 'applying' || status === 'submit_review' || status === 'submitted') {
    return `/applications/${applicationId}`;
  }

  return `/tailoring/${applicationId}`;
}

export default async function ScoutJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getScoutJobDetail(id);

  if (!job) {
    notFound();
  }

  const decision = job.latestDecision;
  const primarySourceUrl = job.sourceRecords.find((record) => record.sourceUrl)?.sourceUrl ?? job.provenance?.sourceUrl ?? null;

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Scout lane</p>
        <div className="button-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>{job.title}</h1>
            <p className="muted">
              {job.companyName} · {job.locationText}
            </p>
            <div className="stack-blocks small muted" style={{ marginTop: '.75rem' }}>
              <div>status: {job.status}</div>
              <div>priority: {job.priorityScore?.toFixed(1) ?? '—'}</div>
              <div>work mode: {job.workMode ?? 'unknown'}</div>
              {job.lastSeenAt ? <div>last seen: {formatDateTime(job.lastSeenAt)}</div> : null}
            </div>
          </div>
          <div className="button-row">
            <Link href="/inbox" className="button-link secondary">
              Back to Inbox
            </Link>
            <Link href="/shortlist" className="button-link secondary">
              Back to Shortlist
            </Link>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Next action</h2>
        <div className="button-row">
          {job.status === 'discovered' ? (
            <>
              <form method="post" action={`/api/actions/jobs/${job.id}/shortlist?next=/jobs/${job.id}`}>
                <button type="submit">Shortlist</button>
              </form>
              <form method="post" action={`/api/actions/jobs/${job.id}/archive?next=/jobs/${job.id}`}>
                <button type="submit">Archive</button>
              </form>
            </>
          ) : null}

          {job.status === 'shortlisted' ? (
            job.activeApplication ? (
              <Link href={applicationRouteForStatus(job.activeApplication.id, job.activeApplication.status)} className="button-link">
                Open {job.activeApplication.status.replaceAll('_', ' ')}
              </Link>
            ) : (
              <form method="get" action={`/api/actions/jobs/${job.id}/start`}>
                <button type="submit">Start application</button>
              </form>
            )
          ) : null}

          {job.status === 'shortlisted' ? (
            <form method="post" action={`/api/actions/jobs/${job.id}/archive?next=/shortlist`}>
              <button type="submit" className="button-link secondary">
                Archive
              </button>
            </form>
          ) : null}

          {primarySourceUrl ? (
            <a href={primarySourceUrl} target="_blank" rel="noreferrer" className="button-link secondary">
              Open source listing
            </a>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <h2>Scout recommendation</h2>
        {decision ? (
          <div className="stack-blocks">
            <div>
              <strong>Verdict:</strong> {decision.verdict}
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
          <p className="muted">No Scout decision recorded yet.</p>
        )}
      </section>

      <section className="panel">
        <h2>Description</h2>
        {job.salaryText ? <p className="muted">Compensation: {job.salaryText}</p> : null}
        {job.description ? (
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{job.description}</div>
        ) : (
          <p className="muted">No description captured yet.</p>
        )}
      </section>

      <section className="panel">
        <h2>Source records</h2>
        {job.sourceRecords.length === 0 ? (
          <p className="muted">No source records linked yet.</p>
        ) : (
          <ul className="simple-list">
            {job.sourceRecords.map((record) => (
              <li key={`${record.sourceKey}:${record.sourceRecordId ?? record.capturedAt}`}>
                <div>
                  <strong>{record.sourceKey}</strong>
                  {record.isPrimary ? ' · primary' : ''}
                </div>
                <div className="muted small">
                  {record.sourceTitle ?? job.title} · {record.sourceCompanyName ?? job.companyName} · {record.sourceLocationText ?? job.locationText}
                </div>
                <div className="muted small">captured {formatDateTime(record.capturedAt)} · match {record.matchType}</div>
                {record.sourceUrl ? (
                  <a href={record.sourceUrl} target="_blank" rel="noreferrer">
                    {record.sourceUrl}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Recent audit events</h2>
        {job.auditEvents.length === 0 ? (
          <p className="muted">No audit events recorded yet.</p>
        ) : (
          <ul className="timeline-list">
            {job.auditEvents.map((event) => (
              <li key={event.id} className="timeline-item">
                <div>
                  <strong>{event.eventType}</strong>
                  <div className="muted small">
                    {event.actorType} · {event.actorLabel}
                  </div>
                  {event.payloadJson ? (
                    <pre className="small muted" style={{ whiteSpace: 'pre-wrap', marginTop: '.5rem' }}>
                      {JSON.stringify(event.payloadJson, null, 2)}
                    </pre>
                  ) : null}
                </div>
                <div className="muted small right-align">{formatDateTime(event.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
