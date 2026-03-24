import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getApplicationDetail } from '../../../../lib/queries';

export const dynamic = 'force-dynamic';
import {
  addApplicationAttachment,
  markApplicationSubmitted,
  moveApplicationBackToApplying,
  moveApplicationToSubmitReview,
  saveApplicationAnswer,
  savePortalSession,
} from './actions';

function renderValue(value: unknown) {
  if (value == null || value === '') {
    return <span className="muted">Empty</span>;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <span>{String(value)}</span>;
  }

  return <code>{JSON.stringify(value)}</code>;
}

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const application = await getApplicationDetail(id);

  if (!application) {
    notFound();
  }

  const readiness = application.readiness!;
  const answers = application.answers ?? [];
  const attachments = application.attachments ?? [];
  const portalSessions = application.portalSessions ?? [];

  return (
    <div className="page-stack">
      <section className="panel">
        <p className="eyebrow">Latch workspace</p>
        <h1>
          {application.job.title} · {application.job.companyName}
        </h1>
        <p className="muted">{application.job.locationText}</p>
        <div className="metric-row">
          <div className="metric-card">
            <span>Status</span>
            <strong>{application.status}</strong>
          </div>
          <div className="metric-card">
            <span>Completion</span>
            <strong>{application.completionPercent}%</strong>
          </div>
          <div className="metric-card">
            <span>Missing required</span>
            <strong>{application.missingRequiredCount}</strong>
          </div>
          <div className="metric-card">
            <span>Low confidence</span>
            <strong>{application.lowConfidenceCount}</strong>
          </div>
        </div>
      </section>

      <section className="grid-two">
        <div className="panel">
          <h2>Readiness summary</h2>
          <div className="stack-blocks">
            <div className={`status-pill ${readiness.ready ? 'ok' : 'danger'}`}>
              {readiness.ready ? 'Ready for submit-review path' : 'Not ready'}
            </div>
            <div className="info-block">
              <span className="eyebrow">Recommended next action</span>
              <strong>{readiness.recommendedNextAction}</strong>
            </div>
          </div>

          <div className="grid-two compact-grid">
            <div>
              <h3>Hard blockers</h3>
              <ul className="simple-list">
                {readiness.hardBlockers.length === 0 ? (
                  <li className="muted">No hard blockers.</li>
                ) : (
                  readiness.hardBlockers.map((issue) => (
                    <li key={issue.code} className="issue-card blocker">
                      <strong>{issue.message}</strong>
                      {issue.count ? <div className="muted small">Count: {issue.count}</div> : null}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div>
              <h3>Warnings</h3>
              <ul className="simple-list">
                {readiness.softWarnings.length === 0 ? (
                  <li className="muted">No active warnings.</li>
                ) : (
                  readiness.softWarnings.map((issue) => (
                    <li key={issue.code} className="issue-card warning">
                      <strong>{issue.message}</strong>
                      {issue.count ? <div className="muted small">Count: {issue.count}</div> : null}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Resume state</h2>
          <div className="stack-blocks">
            <div className="info-block">
              <span className="eyebrow">Base resume</span>
              <strong>{application.baseResume.title}</strong>
              <span className="muted small">{application.baseResume.kind}</span>
            </div>
            <div className="info-block">
              <span className="eyebrow">Tailored resume</span>
              {application.tailoredResume ? (
                <>
                  <strong>{application.tailoredResume.title}</strong>
                  <span className="muted small">{application.tailoredResume.kind}</span>
                </>
              ) : (
                <span className="muted">No tailored resume selected yet.</span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid-two detail-grid">
        <div className="panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">Structured answers</p>
              <h2>Field-level answer inventory</h2>
            </div>
          </div>
          <ul className="simple-list">
            {answers.length === 0 ? (
              <li className="muted">No answers tracked yet.</li>
            ) : (
              answers.map((answer) => (
                <li key={answer.id} className="info-block">
                  <div className="split-line">
                    <strong>{answer.fieldLabel}</strong>
                    <span className={`status-pill subtle ${answer.reviewState === 'blocked' ? 'danger' : answer.reviewState === 'accepted' ? 'ok' : 'warning'}`}>
                      {answer.reviewState}
                    </span>
                  </div>
                  <div className="muted small">
                    {answer.fieldGroup ?? 'ungrouped'} · {answer.sourceType} · confidence{' '}
                    {answer.confidence == null ? 'n/a' : answer.confidence}
                    {answer.required ? ' · required' : ''}
                  </div>
                  <div>{renderValue(answer.value)}</div>
                </li>
              ))
            )}
          </ul>

          <form action={saveApplicationAnswer} className="stack-form form-panel">
            <input type="hidden" name="applicationId" value={application.id} />
            <h3>Add or update answer</h3>
            <div className="grid-two compact-grid">
              <label className="stack-field">
                <span>Field key</span>
                <input name="fieldKey" placeholder="work_authorization" required />
              </label>
              <label className="stack-field">
                <span>Field label</span>
                <input name="fieldLabel" placeholder="Work authorization" required />
              </label>
            </div>
            <div className="grid-two compact-grid">
              <label className="stack-field">
                <span>Field group</span>
                <input name="fieldGroup" placeholder="eligibility" />
              </label>
              <label className="stack-field checkbox-field">
                <span>Required field</span>
                <input type="checkbox" name="required" />
              </label>
            </div>
            <label className="stack-field">
              <span>Value</span>
              <input name="value" placeholder="Yes" />
            </label>
            <div className="grid-two compact-grid">
              <label className="stack-field">
                <span>Source type</span>
                <select name="sourceType" defaultValue="manual">
                  <option value="manual">manual</option>
                  <option value="agent">agent</option>
                  <option value="resume">resume</option>
                  <option value="derived">derived</option>
                </select>
              </label>
              <label className="stack-field">
                <span>Review state</span>
                <select name="reviewState" defaultValue="needs_review">
                  <option value="accepted">accepted</option>
                  <option value="needs_review">needs_review</option>
                  <option value="blocked">blocked</option>
                </select>
              </label>
            </div>
            <label className="stack-field">
              <span>Confidence (0-1)</span>
              <input name="confidence" type="number" min="0" max="1" step="0.01" placeholder="0.85" />
            </label>
            <button type="submit">Save answer</button>
          </form>
        </div>

        <div className="panel">
          <p className="eyebrow">Attachments</p>
          <h2>Attachment integrity</h2>
          <ul className="simple-list">
            {attachments.length === 0 ? (
              <li className="muted">No attachments yet.</li>
            ) : (
              attachments.map((attachment) => (
                <li key={attachment.id} className="info-block">
                  <div className="split-line">
                    <strong>{attachment.filename}</strong>
                    <span className="muted small">{attachment.attachmentType}</span>
                  </div>
                  <div className="muted small">
                    {attachment.resumeVersionTitle ? `Resume: ${attachment.resumeVersionTitle}` : 'Non-resume artifact'}
                  </div>
                  <a href={attachment.fileUrl} className="linkish small" target="_blank" rel="noreferrer">
                    {attachment.fileUrl}
                  </a>
                </li>
              ))
            )}
          </ul>

          <form action={addApplicationAttachment} className="stack-form form-panel">
            <input type="hidden" name="applicationId" value={application.id} />
            <h3>Add attachment</h3>
            <div className="grid-two compact-grid">
              <label className="stack-field">
                <span>Attachment type</span>
                <select name="attachmentType" defaultValue="resume">
                  <option value="resume">resume</option>
                  <option value="other">other</option>
                </select>
              </label>
              <label className="stack-field">
                <span>Resume version id (optional)</span>
                <input name="resumeVersionId" defaultValue={application.tailoredResume?.id ?? ''} />
              </label>
            </div>
            <label className="stack-field">
              <span>Filename</span>
              <input name="filename" placeholder="benny-yuan-tailored.pdf" required />
            </label>
            <label className="stack-field">
              <span>File URL</span>
              <input name="fileUrl" placeholder="seed://resume/tailored.pdf" required />
            </label>
            <button type="submit">Add attachment</button>
          </form>
        </div>
      </section>

      <section className="grid-two detail-grid">
        <div className="panel">
          <p className="eyebrow">Portal sessions</p>
          <h2>Live portal tracking</h2>
          <ul className="simple-list">
            {portalSessions.length === 0 ? (
              <li className="muted">No portal session registered yet.</li>
            ) : (
              portalSessions.map((session) => (
                <li key={session.id} className="info-block">
                  <div className="split-line">
                    <strong>{session.providerDomain}</strong>
                    <span className={`status-pill subtle ${session.status === 'ready_for_review' || session.status === 'submitted' ? 'ok' : 'warning'}`}>
                      {session.status}
                    </span>
                  </div>
                  <div className="muted small">
                    {session.mode} · {session.lastKnownPageTitle ?? 'no page title captured'}
                  </div>
                  <a href={session.launchUrl} className="linkish small" target="_blank" rel="noreferrer">
                    {session.launchUrl}
                  </a>
                  {session.notes ? <div className="muted small">{session.notes}</div> : null}
                </li>
              ))
            )}
          </ul>

          <form action={savePortalSession} className="stack-form form-panel">
            <input type="hidden" name="applicationId" value={application.id} />
            <h3>Register portal session</h3>
            <div className="grid-two compact-grid">
              <label className="stack-field">
                <span>Mode</span>
                <select name="mode" defaultValue="manual">
                  <option value="manual">manual</option>
                  <option value="automation">automation</option>
                  <option value="hybrid">hybrid</option>
                </select>
              </label>
              <label className="stack-field">
                <span>Status</span>
                <select name="status" defaultValue="in_progress">
                  <option value="not_started">not_started</option>
                  <option value="in_progress">in_progress</option>
                  <option value="ready_for_review">ready_for_review</option>
                  <option value="submitted">submitted</option>
                  <option value="abandoned">abandoned</option>
                </select>
              </label>
            </div>
            <label className="stack-field">
              <span>Launch URL</span>
              <input name="launchUrl" placeholder="https://jobs.example.com/apply/123" required />
            </label>
            <div className="grid-two compact-grid">
              <label className="stack-field">
                <span>Provider domain</span>
                <input name="providerDomain" placeholder="jobs.example.com" required />
              </label>
              <label className="stack-field">
                <span>Last known page title</span>
                <input name="lastKnownPageTitle" placeholder="Application review" />
              </label>
            </div>
            <label className="stack-field">
              <span>Notes</span>
              <input name="notes" placeholder="Live portal opened for final check" />
            </label>
            <button type="submit">Save portal session</button>
          </form>
        </div>

        <div className="panel">
          <h2>Recent audit events</h2>
          <ul className="simple-list">
            {application.auditEvents.map((event) => (
              <li key={event.id} className="info-block">
                <strong>{event.eventType}</strong>
                <div className="muted small">
                  {event.entityType} · {event.actorLabel} · {new Date(event.createdAt).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="button-row">
          {application.status === 'applying' ? (
            <form action={moveApplicationToSubmitReview}>
              <input type="hidden" name="applicationId" value={application.id} />
              <button type="submit" disabled={!readiness.ready}>
                Move to submit review
              </button>
            </form>
          ) : null}

          {application.status === 'submit_review' ? (
            <>
              <form action={markApplicationSubmitted}>
                <input type="hidden" name="applicationId" value={application.id} />
                <button type="submit">Mark submitted</button>
              </form>
              <form action={moveApplicationBackToApplying}>
                <input type="hidden" name="applicationId" value={application.id} />
                <button type="submit" className="button-link secondary">
                  Return to applying
                </button>
              </form>
            </>
          ) : null}

          {application.status === 'submitted' ? (
            <div className="status-pill ok">Application marked submitted</div>
          ) : null}

          <Link href={`/tailoring/${application.id}`} className="button-link secondary">
            Open tailoring workspace
          </Link>
          <Link href="/applying" className="button-link secondary">
            Back to applying queue
          </Link>
          <Link href="/submit-review" className="button-link secondary">
            Submit review queue
          </Link>
        </div>
      </section>
    </div>
  );
}
