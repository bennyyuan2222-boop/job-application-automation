import { getRecentAuditEvents } from '../../../lib/queries';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const events = await getRecentAuditEvents(25);

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Activity</p>
        <h1>Audit timeline</h1>
        <p className="muted">Phase 1 exposes the immutable event trail before any heavier workflow automation exists.</p>
      </section>

      <section className="panel">
        <ul className="timeline-list">
          {events.map((event) => (
            <li key={event.id} className="timeline-item">
              <div>
                <strong>{event.eventType}</strong>
                <div className="muted small">
                  {event.entityType} · {event.entityId}
                </div>
              </div>
              <div className="muted small right-align">
                <div>{event.actorLabel}</div>
                <div>{new Date(event.createdAt).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
