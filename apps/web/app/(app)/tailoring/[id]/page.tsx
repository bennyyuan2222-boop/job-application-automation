import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getTailoringDetail } from '../../../../lib/queries';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

function humanizeStatus(value: string) {
  return value.replaceAll('_', ' ');
}

function getSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

export default async function TailoringDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: SearchParams;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedRunId = getSearchParamValue(resolvedSearchParams.run).trim();
  const detail = await getTailoringDetail(id);

  if (!detail) {
    notFound();
  }

  const reviewedRun = detail.runHistory.find((run) => run.id === requestedRunId) ?? detail.latestRun;
  const isViewingLatest = reviewedRun?.id === detail.latestRun?.id;
  const reviewDraftTitle = reviewedRun?.outputResumeTitle
    ? `${isViewingLatest ? 'Latest draft' : 'Selected draft'} · ${reviewedRun.outputResumeTitle}`
    : isViewingLatest
      ? 'Latest draft'
      : 'Selected draft';
  const reviewDraftContent = reviewedRun?.outputResumeMarkdown ?? 'No draft generated for this run.';

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
            <span>{isViewingLatest ? 'Latest run' : 'Reviewing run'}</span>
            <strong>{reviewedRun?.status ?? 'none'}</strong>
            {reviewedRun?.generationMetadata?.executionMode ? (
              <span className="muted small">{reviewedRun.generationMetadata.executionMode}</span>
            ) : null}
            {!isViewingLatest && detail.latestRun ? (
              <span className="muted small">latest is {detail.latestRun.status}</span>
            ) : null}
          </div>
          <div className="metric-card">
            <span>Approved resume</span>
            <strong>{detail.selectedTailoredResume?.title ?? 'not selected'}</strong>
          </div>
        </div>
        {detail.pausedReason ? <p className="error-banner">Paused: {detail.pausedReason}</p> : null}
        {!isViewingLatest && detail.latestRun ? (
          <p className="muted">
            Viewing historical run.{' '}
            <Link href={`/tailoring/${detail.applicationId}`} className="button-link secondary">
              Jump back to latest draft
            </Link>
          </p>
        ) : null}
        {reviewedRun?.failureCode ? (
          <p className="error-banner">
            This run failed: <strong>{reviewedRun.failureCode}</strong>
            {reviewedRun.failureMessage ? ` — ${reviewedRun.failureMessage}` : ''}
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
              <input type="hidden" name="tailoringRunId" value={reviewedRun?.id ?? ''} />
              <label className="stack-field">
                <span>Request edits from this run</span>
                <textarea
                  name="revisionNote"
                  rows={3}
                  required
                  placeholder="Ask Needle to tighten or change emphasis without inventing claims."
                />
              </label>
              <button type="submit" disabled={!reviewedRun}>
                Request edits + regenerate
              </button>
              <p className="muted small">
                Revisions branch from the run you are reviewing and continue inside the same application-scoped Needle session.
              </p>
            </form>

            <div className="button-row">
              <form method="get" action="/api/actions/tailoring/approve">
                <input type="hidden" name="applicationId" value={detail.applicationId} />
                <input type="hidden" name="tailoringRunId" value={reviewedRun?.id ?? ''} />
                <button type="submit" disabled={!reviewedRun?.outputResumeVersionId}>
                  Approve this draft
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

      {reviewedRun &&
      (reviewedRun.fitAssessment ||
        reviewedRun.generationMetadata ||
        reviewedRun.baseSelection ||
        reviewedRun.failureCode) ? (
        <section className="grid-two">
          <div className="panel">
            <p className="eyebrow">Fit assessment</p>
            {reviewedRun.fitAssessment ? (
              <>
                <h2>
                  {humanizeStatus(reviewedRun.fitAssessment.verdict)} ·{' '}
                  {humanizeStatus(reviewedRun.fitAssessment.proceedRecommendation)}
                </h2>
                <p className="long-copy">{reviewedRun.fitAssessment.summary}</p>
                <div className="grid-two compact-grid">
                  <div>
                    <h3>Matched strengths</h3>
                    <ul className="simple-list compact-list">
                      {reviewedRun.fitAssessment.matchedStrengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3>Likely gaps</h3>
                    <ul className="simple-list compact-list">
                      {reviewedRun.fitAssessment.likelyGaps.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {reviewedRun.fitAssessment.riskNotes.length ? (
                  <div>
                    <h3>Risk notes</h3>
                    <ul className="simple-list compact-list">
                      {reviewedRun.fitAssessment.riskNotes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="muted">No fit assessment is available for this run.</p>
            )}
          </div>
          <div className="panel">
            <p className="eyebrow">Generation metadata</p>
            <ul className="simple-list compact-list">
              <li>
                <strong>Execution mode</strong> — {reviewedRun.generationMetadata?.executionMode ?? 'unknown'}
              </li>
              <li>
                <strong>Strategy</strong> — {reviewedRun.generationMetadata?.strategyVersion ?? 'unknown'}
              </li>
              <li>
                <strong>Provider</strong> — {reviewedRun.generationMetadata?.provider ?? 'unknown'}
              </li>
              <li>
                <strong>Model</strong> — {reviewedRun.generationMetadata?.modelId ?? 'n/a'}
              </li>
              <li>
                <strong>Latency</strong> —{' '}
                {typeof reviewedRun.generationMetadata?.latencyMs === 'number'
                  ? `${reviewedRun.generationMetadata.latencyMs} ms`
                  : 'n/a'}
              </li>
              <li>
                <strong>Session key</strong> — {reviewedRun.generationMetadata?.sessionKey ?? 'n/a'}
              </li>
              <li>
                <strong>Source run</strong> — {reviewedRun.sourceTailoringRunId ?? 'n/a'}
              </li>
            </ul>
            {reviewedRun.baseSelection ? (
              <>
                <h3>Base selection</h3>
                <p>
                  <strong>{reviewedRun.baseSelection.selectedResumeTitle}</strong>
                  {reviewedRun.baseSelection.lane ? ` · ${reviewedRun.baseSelection.lane}` : ''}
                </p>
                <ul className="simple-list compact-list">
                  {reviewedRun.baseSelection.reasons.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {reviewedRun ? (
        <section className="grid-two">
          <div className="panel">
            <p className="eyebrow">Rationale</p>
            <ul className="simple-list compact-list">
              {reviewedRun.rationale.length > 0 ? (
                reviewedRun.rationale.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li className="muted">No rationale captured for this run.</li>
              )}
            </ul>
          </div>
          <div className="panel">
            <p className="eyebrow">Change summary</p>
            <ul className="simple-list compact-list">
              {reviewedRun.changeSummary.length > 0 ? (
                reviewedRun.changeSummary.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li className="muted">No change summary captured for this run.</li>
              )}
            </ul>
          </div>
        </section>
      ) : null}

      {reviewedRun?.risks.length ? (
        <section className="panel">
          <p className="eyebrow">Truth/risk review</p>
          <ul className="simple-list compact-list">
            {reviewedRun.risks.map((risk) => (
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
        <ResumePreview title={reviewDraftTitle} content={reviewDraftContent} />
      </section>

      <section className="grid-two">
        <div className="panel">
          <p className="eyebrow">Run history</p>
          <ul className="simple-list compact-list">
            {detail.runHistory.map((run) => {
              const isSelected = run.id === reviewedRun?.id;
              const runHref = run.id === detail.latestRun?.id ? `/tailoring/${detail.applicationId}` : `/tailoring/${detail.applicationId}?run=${run.id}`;
              return (
                <li key={run.id}>
                  <div className="button-row">
                    <div>
                      <strong>{run.status}</strong>
                      <div className="muted small">
                        {new Date(run.createdAt).toLocaleString()}
                        {run.generationMetadata?.executionMode ? ` · ${run.generationMetadata.executionMode}` : ''}
                        {run.sourceTailoringRunId ? ` · from ${run.sourceTailoringRunId}` : ''}
                        {run.revisionNote ? ` · revision requested` : ''}
                      </div>
                    </div>
                    <div className="button-row">
                      {run.id === detail.latestRun?.id ? <span className="muted small">latest</span> : null}
                      {isSelected ? (
                        <span className="muted small">viewing</span>
                      ) : (
                        <Link href={runHref} className="button-link secondary">
                          Review this run
                        </Link>
                      )}
                    </div>
                  </div>
                  {run.revisionNote ? <div className="muted small">Revision note: {run.revisionNote}</div> : null}
                  {run.changeSummary[0] ? <div className="muted small">{run.changeSummary[0]}</div> : null}
                  {run.failureCode ? (
                    <div className="muted small">
                      failure: {run.failureCode}
                      {run.failureMessage ? ` — ${run.failureMessage}` : ''}
                    </div>
                  ) : null}
                </li>
              );
            })}
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
