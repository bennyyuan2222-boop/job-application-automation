import Link from 'next/link';

import { AutoRefresh } from '../../../components/auto-refresh';
import { getTailoringQueue } from '../../../lib/queries';
import { generateDraftAction } from './actions';

export default async function TailoringPage() {
  const queue = await getTailoringQueue();
  const hasActiveTask = queue.some((item) => Boolean(item.activeTask));

  return (
    <div className="page-stack">
      <AutoRefresh enabled={hasActiveTask} intervalMs={5000} />
      <section className="panel">
        <p className="eyebrow">Tailoring</p>
        <h1>Needle review queue</h1>
        <p className="muted">
          Base resume selection, truthful draft generation, and review-oriented tailoring all live here.
        </p>
      </section>

      {queue.length === 0 ? (
        <section className="panel">
          <p className="muted">No applications are currently in the tailoring lane.</p>
        </section>
      ) : (
        <section className="panel">
          <ul className="simple-list">
            {queue.map((item) => (
              <li key={item.applicationId} className="queue-card">
                <div className="queue-card-main">
                  <div>
                    <p className="eyebrow">{item.applicationStatus}</p>
                    <h2>
                      {item.job.title} · {item.job.companyName}
                    </h2>
                    <p className="muted small">{item.job.locationText}</p>
                  </div>

                  <div className="queue-meta-grid">
                    <div className="info-block">
                      <span className="eyebrow">Base resume</span>
                      <strong>{item.baseResume.title}</strong>
                    </div>
                    <div className="info-block">
                      <span className="eyebrow">Needle task</span>
                      <strong>
                        {item.activeTask
                          ? item.activeTask.status
                          : item.latestTask
                            ? item.latestTask.status
                            : item.latestRun?.status ?? 'none yet'}
                      </strong>
                      {item.activeTask ? (
                        <span className="muted small">
                          {item.activeTask.taskType} · requested by {item.activeTask.requestedByLabel}
                        </span>
                      ) : item.latestTask ? (
                        <span className="muted small">
                          {item.latestTask.taskType} · requested by {item.latestTask.requestedByLabel}
                        </span>
                      ) : item.latestRun?.generationMetadata?.executionMode ? (
                        <span className="muted small">{item.latestRun.generationMetadata.executionMode}</span>
                      ) : null}
                      {item.activeTask?.failureCode ? (
                        <span className="muted small">{item.activeTask.failureCode}</span>
                      ) : item.latestTask?.failureCode ? (
                        <span className="muted small">{item.latestTask.failureCode}</span>
                      ) : item.latestRun?.failureCode ? (
                        <span className="muted small">{item.latestRun.failureCode}</span>
                      ) : item.latestRun?.changeSummary?.[0] ? (
                        <span className="muted small">{item.latestRun.changeSummary[0]}</span>
                      ) : null}
                    </div>
                    <div className="info-block">
                      <span className="eyebrow">Selected tailored resume</span>
                      {item.selectedTailoredResume ? (
                        <>
                          <strong>{item.selectedTailoredResume.title}</strong>
                          <span className="muted small">approved/selected</span>
                        </>
                      ) : (
                        <span className="muted small">No approved tailored resume yet.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <Link href={`/tailoring/${item.applicationId}`} className="button-link secondary">
                    Open tailoring workspace
                  </Link>
                  <form action={generateDraftAction}>
                    <input type="hidden" name="applicationId" value={item.applicationId} />
                    <button type="submit" disabled={Boolean(item.activeTask)}>
                      {item.activeTask ? 'Needle task in progress' : 'Generate fresh draft'}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
