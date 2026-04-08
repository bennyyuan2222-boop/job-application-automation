import Link from 'next/link';

import { AutoRefresh } from '../../../components/auto-refresh';
import { getApplyingQueue, getLatestLatchWorkerHeartbeatSummary } from '../../../lib/queries';

function humanize(value: string) {
  return value.replaceAll('_', ' ');
}

function formatRelativeAge(ageSeconds: number) {
  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }

  const minutes = Math.floor(ageSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function getWorkspacePrepTone(state: string) {
  switch (state) {
    case 'prepared':
      return 'ok';
    case 'queued':
    case 'processing':
      return 'warning';
    case 'failed':
      return 'danger';
    default:
      return 'subtle';
  }
}

function getHeartbeatTone(freshness: string) {
  switch (freshness) {
    case 'fresh':
      return 'ok';
    case 'delayed':
      return 'warning';
    default:
      return 'danger';
  }
}

export default async function ApplyingPage() {
  const [applications, latestHeartbeat] = await Promise.all([
    getApplyingQueue(),
    getLatestLatchWorkerHeartbeatSummary(),
  ]);
  const hasActiveLatchTask = applications.some((application) => Boolean(application.activeLatchTask));

  return (
    <div className="page-stack">
      <AutoRefresh enabled={hasActiveLatchTask} intervalMs={5000} />
      <section className="panel">
        <p className="eyebrow">Applying</p>
        <h1>Latch operating queue</h1>
        <p className="muted">
          This is the first real Latch slice: visible readiness, field-level answers, attachment safety, and portal-session
          tracking without browser automation.
        </p>
        {latestHeartbeat ? (
          <div className="top-gap">
            <div className={`status-pill ${getHeartbeatTone(latestHeartbeat.freshness)}`}>
              Worker heartbeat {latestHeartbeat.freshness}
            </div>
            <p className="muted small">
              {latestHeartbeat.workerLabel} · {latestHeartbeat.state} · {formatRelativeAge(latestHeartbeat.ageSeconds)}
              {latestHeartbeat.currentTaskType ? ` · ${humanize(latestHeartbeat.currentTaskType)}` : ''}
            </p>
          </div>
        ) : (
          <p className="muted small top-gap">No Latch worker heartbeat recorded yet.</p>
        )}
      </section>

      <section className="panel">
        {applications.length === 0 ? (
          <p className="muted">No applying-state applications yet.</p>
        ) : (
          <div className="table-like-list">
            {applications.map((application) => {
              const task = application.activeLatchTask ?? application.latestLatchTask;
              return (
                <Link key={application.id} href={`/applications/${application.id}`} className="queue-card-link">
                  <article className="queue-card">
                    <div>
                      <div className="eyebrow">{humanize(application.status)}</div>
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

                    <div className="queue-meta-grid">
                      <div className="info-block">
                        <span className="eyebrow">Tailored resume</span>
                        <strong>{application.selectedTailoredResumeTitle ?? 'not selected'}</strong>
                      </div>

                      <div className="info-block">
                        <span className="eyebrow">Workspace prep</span>
                        <div className={`status-pill ${getWorkspacePrepTone(application.workspacePrepState)}`}>
                          {humanize(application.workspacePrepState)}
                          {application.latestLatchTask?.responseStatus ? ` · ${humanize(application.latestLatchTask.responseStatus)}` : ''}
                        </div>
                        {task ? (
                          <span className="muted small">
                            {humanize(task.status)} · {humanize(task.taskType)}
                            {task.workerLabel ? ` · ${task.workerLabel}` : ''}
                          </span>
                        ) : (
                          <span className="muted small">No Latch task queued yet.</span>
                        )}
                        {application.latestLatchTask?.failureCode ? (
                          <span className="muted small">
                            {application.latestLatchTask.failureCode}
                            {application.latestLatchTask.failureMessage ? ` · ${application.latestLatchTask.failureMessage}` : ''}
                          </span>
                        ) : application.latestLatchTask?.responseSummary ? (
                          <span className="muted small">{application.latestLatchTask.responseSummary}</span>
                        ) : null}
                      </div>

                      <div className="info-block">
                        <span className="eyebrow">Worker heartbeat</span>
                        {application.latchWorker ? (
                          <>
                            <strong>
                              {humanize(application.latchWorker.freshness)} · {formatRelativeAge(application.latchWorker.ageSeconds)}
                            </strong>
                            <span className="muted small">
                              {application.latchWorker.workerLabel} · {application.latchWorker.state}
                            </span>
                            {application.latchWorker.lastErrorCode ? (
                              <span className="muted small">
                                {application.latchWorker.lastErrorCode}
                                {application.latchWorker.lastErrorMessage ? ` · ${application.latchWorker.lastErrorMessage}` : ''}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="muted small">No worker heartbeat yet.</span>
                        )}
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
