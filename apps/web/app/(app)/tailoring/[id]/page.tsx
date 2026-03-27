import { notFound } from 'next/navigation';

import { getTailoringDetail } from '../../../../lib/queries';

function ResumePreview({ title, content }: { title: string; content: string }) {
  return (
    <div className="panel preview-panel">
      <div className="preview-header">
        <p className="eyebrow">{title}</p>
      </div>
      <pre className="markdown-preview">{content}</pre>
    </div>
  );
}

export default async function TailoringDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getTailoringDetail(id);

  if (!detail) {
    notFound();
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Tailoring workspace</p>
        <h1>
          {detail.job.title} · {detail.job.companyName}
        </h1>
        <p className="muted">{detail.job.locationText}</p>
        <div className="metric-row metric-row-three">
          <div className="metric-card">
            <span>Application status</span>
            <strong>{detail.applicationStatus}</strong>
          </div>
          <div className="metric-card">
            <span>Latest run</span>
            <strong>{detail.latestRun?.status ?? 'none'}</strong>
            {detail.latestRun?.generationMetadata?.executionMode ? (
              <span className="muted small">{detail.latestRun.generationMetadata.executionMode}</span>
            ) : null}
          </div>
          <div className="metric-card">
            <span>Approved resume</span>
            <strong>{detail.selectedTailoredResume?.title ?? 'not selected'}</strong>
          </div>
        </div>
        {detail.pausedReason ? <p className="error-banner">Paused: {detail.pausedReason}</p> : null}
        {detail.latestRun?.failureCode ? (
          <p className="error-banner">
            Latest run failed: <strong>{detail.latestRun.failureCode}</strong>
            {detail.latestRun.failureMessage ? ` — ${detail.latestRun.failureMessage}` : ''}
          </p>
        ) : null}
      </section>

      <section className="grid-two layout-job-review">
        <div className="panel">
          <p className="eyebrow">Job context</p>
          <h2>Description</h2>
          <p className="long-copy">{detail.job.description}</p>
          <div className="grid-two compact-grid">
            <div>
              <h3>Must have</h3>
              <ul className="simple-list compact-list">
                {detail.job.requirements.mustHave.length > 0 ? (
                  detail.job.requirements.mustHave.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li className="muted">None captured</li>
                )}
              </ul>
            </div>
            <div>
              <h3>Nice to have</h3>
              <ul className="simple-list compact-list">
                {detail.job.requirements.niceToHave.length > 0 ? (
                  detail.job.requirements.niceToHave.map((item) => <li key={item}>{item}</li>)
                ) : (
                  <li className="muted">None captured</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="eyebrow">Review controls</p>
          <div className="stack-blocks">
            <form method="get" action="/api/actions/tailoring/generate" className="stack-form">
              <input type="hidden" name="applicationId" value={detail.applicationId} />
              <label className="stack-field">
                <span>Optional instruction</span>
                <textarea
                  name="instructions"
                  rows={3}
                  placeholder="Emphasize workflow mapping, stakeholder communication, or leave blank for default regeneration."
                />
              </label>
              <button type="submit">Generate fresh draft</button>
            </form>

            <form method="get" action="/api/actions/tailoring/request-edits" className="stack-form">
              <input type="hidden" name="applicationId" value={detail.applicationId} />
              <input type="hidden" name="tailoringRunId" value={detail.latestRun?.id ?? ''} />
              <label className="stack-field">
                <span>Request edits</span>
                <textarea
                  name="revisionNote"
                  rows={3}
                  required
                  placeholder="Ask Needle to tighten or change emphasis without inventing claims."
                />
              </label>
              <button type="submit" disabled={!detail.latestRun}>
                Request edits + regenerate
              </button>
            </form>

            <div className="button-row">
              <form method="get" action="/api/actions/tailoring/approve">
                <input type="hidden" name="applicationId" value={detail.applicationId} />
                <input type="hidden" name="tailoringRunId" value={detail.latestRun?.id ?? ''} />
                <button type="submit" disabled={!detail.latestRun}>
                  Approve latest draft
                </button>
              </form>
              <form method="get" action="/api/actions/tailoring/pause" className="inline-form">
                <input type="hidden" name="applicationId" value={detail.applicationId} />
                <input name="reason" required placeholder="Pause reason" />
                <button type="submit" className="button-link secondary">
                  Pause
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {detail.latestRun &&
      (detail.latestRun.fitAssessment ||
        detail.latestRun.generationMetadata ||
        detail.latestRun.baseSelection ||
        detail.latestRun.failureCode) ? (
        <section className="grid-two">
          <div className="panel">
            <p className="eyebrow">Fit assessment</p>
            {detail.latestRun.fitAssessment ? (
              <>
                <h2>
                  {detail.latestRun.fitAssessment.verdict.replaceAll('_', ' ')} ·{' '}
                  {detail.latestRun.fitAssessment.proceedRecommendation.replaceAll('_', ' ')}
                </h2>
                <p className="long-copy">{detail.latestRun.fitAssessment.summary}</p>
                <div className="grid-two compact-grid">
                  <div>
                    <h3>Matched strengths</h3>
                    <ul className="simple-list compact-list">
                      {detail.latestRun.fitAssessment.matchedStrengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>Likely gaps</h3>
                    <ul className="simple-list compact-list">
                      {detail.latestRun.fitAssessment.likelyGaps.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {detail.latestRun.fitAssessment.riskNotes.length ? (
                  <div>
                    <h3>Risk notes</h3>
                    <ul className="simple-list compact-list">
                      {detail.latestRun.fitAssessment.riskNotes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">No fit assessment is available for the latest run.</p>
            )}
          </div>
          <div className="panel">
            <p className="eyebrow">Generation metadata</p>
            <ul className="simple-list compact-list">
              <li>
                <strong>Execution mode</strong> — {detail.latestRun.generationMetadata?.executionMode ?? 'unknown'}
              </li>
              <li>
                <strong>Strategy</strong> — {detail.latestRun.generationMetadata?.strategyVersion ?? 'unknown'}
              </li>
              <li>
                <strong>Provider</strong> — {detail.latestRun.generationMetadata?.provider ?? 'unknown'}
              </li>
              <li>
                <strong>Model</strong> — {detail.latestRun.generationMetadata?.modelId ?? 'n/a'}
              </li>
              <li>
                <strong>Latency</strong> —
                {' '}
                {typeof detail.latestRun.generationMetadata?.latencyMs === 'number'
                  ? `${detail.latestRun.generationMetadata.latencyMs} ms`
                  : 'n/a'}
              </li>
              <li>
                <strong>Session key</strong> — {detail.latestRun.generationMetadata?.sessionKey ?? 'n/a'}
              </li>
              <li>
                <strong>Source run</strong> — {detail.latestRun.sourceTailoringRunId ?? 'n/a'}
              </li>
            </ul>
            {detail.latestRun.baseSelection ? (
              <>
                <h3>Base selection</h3>
                <p>
                  <strong>{detail.latestRun.baseSelection.selectedResumeTitle}</strong>
                  {detail.latestRun.baseSelection.lane ? ` · ${detail.latestRun.baseSelection.lane}` : ''}
                </p>
                <ul className="simple-list compact-list">
                  {detail.latestRun.baseSelection.reasons.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {detail.latestRun ? (
        <section className="grid-two">
          <div className="panel">
            <p className="eyebrow">Rationale</p>
            <ul className="simple-list compact-list">
              {detail.latestRun.rationale.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <p className="eyebrow">Change summary</p>
            <ul className="simple-list compact-list">
              {detail.latestRun.changeSummary.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {detail.latestRun?.risks.length ? (
        <section className="panel">
          <p className="eyebrow">Truth/risk review</p>
          <ul className="simple-list compact-list">
            {detail.latestRun.risks.map((risk) => (
              <li key={`${risk.requirement}-${risk.severity}`}>
                <strong>{risk.requirement}</strong> — {risk.reason}{' '}
                <span className="muted">({risk.severity})</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid-two preview-grid">
        <ResumePreview title={`Base resume · ${detail.baseResume.title}`} content={detail.baseResume.contentMarkdown} />
        <ResumePreview
          title={detail.latestDraft ? `Latest draft · ${detail.latestDraft.title}` : 'Latest draft'}
          content={detail.latestDraft?.contentMarkdown ?? 'No draft generated yet.'}
        />
      </section>

      <section className="grid-two">
        <div className="panel">
          <p className="eyebrow">Run history</p>
          <ul className="simple-list compact-list">
            {detail.runHistory.map((run) => (
              <li key={run.id}>
                <strong>{run.status}</strong>
                <div className="muted small">
                  {new Date(run.createdAt).toLocaleString()}
                  {run.generationMetadata?.executionMode ? ` · ${run.generationMetadata.executionMode}` : ''}
                  {run.revisionNote ? ` · ${run.revisionNote}` : ''}
                  {run.sourceTailoringRunId ? ` · from ${run.sourceTailoringRunId}` : ''}
                </div>
                {run.failureCode ? (
                  <div className="muted small">
                    failure: {run.failureCode}
                    {run.failureMessage ? ` — ${run.failureMessage}` : ''}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <p className="eyebrow">Audit trail</p>
          <ul className="simple-list compact-list">
            {detail.auditEvents.map((event) => (
              <li key={event.id}>
                <strong>{event.eventType}</strong>
                <div className="muted small">
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
