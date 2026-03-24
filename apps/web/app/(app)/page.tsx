import Link from 'next/link';

import { getRecentAuditEvents, getSeededJobs } from '../../lib/queries';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [jobs, events] = await Promise.all([getSeededJobs(), getRecentAuditEvents(5)]);

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Scout lane</p>
        <h1>Discovery + triage backbone is live</h1>
        <p className="muted">
          This slice now shows DB-backed Scout output, provenance-friendly job records, and audit activity without falling back to JSONL trackers.
        </p>
        <div className="button-row">
          <Link href="/applications/seed-application-acme" className="button-link">
            Open seeded application
          </Link>
          <Link href="/activity" className="button-link secondary">
            View activity
          </Link>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <h2>Seeded jobs</h2>
          <ul className="simple-list">
            {jobs.map((job) => (
              <li key={job.id}>
                <strong>{job.title}</strong>
                <div className="muted">
                  {job.companyName} · {job.locationText} · {job.status}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Recent audit activity</h2>
          <ul className="simple-list">
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.eventType}</strong>
                <div className="muted">
                  {event.actorLabel} · {new Date(event.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
