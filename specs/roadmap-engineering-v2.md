# Job Ops Roadmap Engineering v2

_Status: canonical engineering addendum_
_Last updated: 2026-03-25_

## Purpose

This doc is the engineering-oriented v2 pass over the milestone specs.

It adds the concrete implementation detail that the v1 milestone docs intentionally left lighter:
- proposed DB entity/model names
- route/file boundaries
- worker/service boundaries
- test cases per feature
- repo conventions that should stay stable while the milestones are built

## Related docs

- `specs/roadmap-milestones-v1.md`
- `specs/cross-milestone-dependency-map-v1.md`
- `specs/milestone-1-scout-implementation-checklist-v1.md`
- `specs/milestone-1-scout-automation-and-triage-v1.md`
- `specs/milestone-2-needle-tailoring-system-v1.md`
- `specs/milestone-3-latch-application-ops-v1.md`
- `specs/milestone-4-submit-review-and-recording-v1.md`
- `specs/milestone-5-browser-assisted-fill-v1.md`

## Current repo realities

The engineering plan should start from the repo that actually exists, not from an imaginary clean-room architecture.

Observed realities:
- `packages/db/prisma/schema.prisma` already contains the core models for jobs, applications, resumes, tailoring runs, attachments, portal sessions, and audit events
- the repo now has a stable Scout entrypoint (`scripts/scout-run.ts`), Gateway wrapper (`scripts/scout-run-gateway.sh`), and a provider seam in `scripts/scout-source-adapters.ts`
- `workers/scout/index.ts` still combines too much ingestion + normalization + dedupe + score + DB write logic inline, and it does not yet persist a separate Scout decision layer
- `workers/needle/src/service.ts` exists and already handles generation / approve / edits-requested / pause
- there is not yet a real `workers/latch` implementation package in the repo
- `packages/read-models` exists, but many queue/detail queries still live in `apps/web/lib/queries.ts`
- `app/api/resume-artifacts/[resumeVersionId]/route.ts` still serves markdown, not a true PDF artifact
- the repo currently lacks a concrete `tests/` tree even though the architecture docs expect one

## Global engineering conventions

These conventions should be followed across all milestones.

### 1. DB/entity naming convention

**Recommendation for v2:** keep the current Prisma model naming convention stable to minimize churn.

That means the canonical entities remain Prisma-model-first names such as:
- `ScrapeRun`
- `JobSourceRecord`
- `JobSourceLink`
- `Job`
- `JobScorecard`
- `ResumeVersion`
- `TailoringRun`
- `Application`
- `ApplicationAnswer`
- `ApplicationAttachment`
- `PortalSession`
- `AuditEvent`

New recommended models follow the same style:
- `ScoutDecision`
- `ProfileAnswer`
- `SubmitReviewSnapshot`
- `SubmissionRecord`
- `PortalAutomationRun`
- `PortalEvidence`

If SQL-level snake_case physical tables are desired later, add explicit `@@map(...)` in a dedicated naming migration. Do **not** combine naming churn with milestone feature work.

### 2. Route convention

Use two distinct route classes:

#### User-facing mutations
- Next.js server actions where ergonomic
- or `app/api/actions/**` routes when a route is preferable

These are human-triggered application actions.

#### Protected internal/system entrypoints
- `app/api/internal/**`

These are for:
- future hosted schedulers or Gateway helper callbacks when a web entrypoint is actually needed
- background callbacks
- internal browser/worker triggers
- admin/debug paths that should not behave like normal user actions

### 3. Worker/service convention

Long-running logic should not live in route handlers.

For Scout specifically, keep the layers separate:
- deterministic ingest = fetch, normalize, dedupe, provenance, scorecards
- decision pass = verdict, confidence, ambiguity flags, conservative auto-actions

Recommended layering:
- `apps/web` — auth, UI, route wiring, thin orchestration
- `packages/domain` — pure rules, invariants, event names, normalization
- `packages/read-models` — queue/detail queries and shaping for UI
- `packages/readiness` — readiness rules
- `packages/tailoring` — resume selection/generation/render helpers
- `packages/automation` — browser/ATS adapters and shared automation helpers
- `workers/*` — runtime orchestration and DB mutations for async or lane-specific work

### 4. Artifact convention

Textual resume truth remains canonical in `ResumeVersion`.

Operational artifact rule:
- downstream upload/use should target `renderedPdfUrl`
- web routes may proxy or redirect to artifact storage
- markdown-only pseudo-artifacts are acceptable for early local development, but **not** for Milestone 2 exit or later production claims

### 5. Testing convention

Recommended stack:
- **Vitest** for unit and service/integration tests
- **Playwright** for browser harness + Greenhouse adapter validation

Recommended repo directories:
- `tests/fixtures/`
- `tests/integration/`
- `tests/browser-harness/`

### 6. Audit-event convention

Every lane should define stable event names early.
Do not let event names drift ad hoc from file to file.

---

## Milestone 1 — Scout automation engineering plan

## Proposed data model plan

### Keep
- `ScrapeRun`
- `JobSourceRecord`
- `JobSourceLink`
- `Job`
- `JobScorecard`
- `AuditEvent`

### Change

#### `ScrapeRun`
Add or harden fields:
- `triggerType` — enum `scheduled | manual | backfill | test`
- `boardKey` — first value `indeed`
- `idempotencyKey`
- `fetchedCount`
- `capturedCount`
- `normalizedCount`
- `rejectedCount`
- `erroredCount`
- `warningsJson`
- `errorSummaryJson`
- `adapterVersion`

Expand `status` enum to:
- `created`
- `fetching`
- `processing`
- `completed`
- `partial`
- `failed`
- `cancelled`

#### `JobSourceRecord`
Add or harden fields:
- `boardKey`
- `payloadHash`
- `dedupeKey`
- `seenAt`
- `rejectionReason`
- `errorMessage`

Expand `status` enum to include:
- `errored`

#### `JobScorecard`
Add:
- `scorerVersion`

#### `ScoutDecision`
Add a new model with at least:
- `jobId`
- `scrapeRunId?`
- `verdict` (`shortlist | archive | defer | needs_human_review`)
- `decisionSource` (`heuristic | agent | hybrid`)
- `confidence`
- `reasonSummary?`
- `reasonsJson`
- `ambiguityFlagsJson`
- `policyVersion`
- `actedAutomatically`
- timestamps

Purpose:
- persist what Scout recommended
- preserve why Scout recommended it
- distinguish human review from automatic action

## Proposed entrypoint/file plan

### Existing files to keep using
- `apps/web/app/(app)/jobs/actions.ts`
- `apps/web/app/api/actions/scout/run-sample/route.ts`
- `workers/scout/index.ts` (thin compatibility export)

### New files to add
- `workers/scout/src/index.ts`
- `workers/scout/src/service.ts`
- `workers/scout/src/adapters/jobspy-mcp.ts`
- `workers/scout/src/idempotency.ts`
- `workers/scout/src/decision.ts`
- `packages/domain/src/scout-triage.ts`
- `packages/read-models/src/scout.ts`
- `scripts/scout-run.ts`
- `scripts/scout-health.ts` (optional)
- `apps/web/app/api/internal/scout/run/route.ts` (optional future/manual)
- `apps/web/app/(app)/scout-runs/page.tsx`
- `apps/web/app/(app)/scout-runs/[runId]/page.tsx` (optional but recommended)

### Entrypoint responsibilities

#### `scripts/scout-run.ts`
Purpose:
- stable repo-owned Scout entrypoint for OpenClaw/Gateway cron
- execute the configured Indeed JobSpy scout pass through the shared Scout service
- print structured success/failure output for logs and debugging

#### `scripts/scout-health.ts`
Purpose:
- summarize recent Scout run health for heartbeat checks or quick operator debugging

#### `app/api/internal/scout/run/route.ts`
Purpose:
- manual/internal trigger using the same service path as the script entrypoint
- supports debugging, backfills, smoke tests, and any future hosted scheduler

#### `app/(app)/jobs/actions.ts`
Purpose:
- user-triggered demo/manual flows
- should call the same Scout service boundary rather than inventing separate logic

## Worker boundary

### `workers/scout/src/adapters/jobspy-mcp.ts`
Owns:
- JobSpy MCP request/response transport
- Indeed-specific fetch configuration
- translating adapter output into canonical raw Scout inputs

### `workers/scout/src/service.ts`
Owns:
- run lifecycle
- idempotency checks
- source-record capture
- job dedupe/create/update
- scorecard writes
- invoking the Scout decision pass for candidate jobs
- audit events

### `workers/scout/src/decision.ts`
Owns:
- selecting candidate jobs for decisioning after ingest
- persisting `ScoutDecision`
- applying conservative auto-shortlist / auto-archive actions when policy allows
- preserving ambiguous jobs for human review

### `packages/domain/src/scout.ts`
Owns:
- normalization helpers
- work-mode inference
- dedupe key generation
- score policy
- pure match classification helpers

### `packages/domain/src/scout-triage.ts`
Owns:
- verdict classification helpers
- ambiguity-flag generation
- confidence threshold rules
- auto-action eligibility

## Feature test cases

| Feature | Test cases |
|---|---|
| Gateway cron scheduling | scheduled Gateway run invokes the stable Scout entrypoint; run is marked `scheduled`; recurring runs can stay isolated/noise-controlled |
| JobSpy->Indeed mapping | maps company/title/location/url/date correctly; tolerates missing salary/url gracefully |
| Run bookkeeping | creates run with correct trigger type; transitions `created -> fetching -> processing -> completed/partial/failed` correctly |
| Idempotency | duplicate scheduler delivery does not create duplicate run effects for the same idempotency window |
| Dedupe | exact rerun creates no duplicate job; same job with minor title punctuation changes links instead of duplicating |
| Scout decisioning | fresh jobs receive `ScoutDecision` rows with verdict/confidence/reasons; strong positive/negative cases can auto-route conservatively |
| Ambiguity handling | gray-zone cases persist `needs_human_review` or `defer` with ambiguity flags rather than disappearing silently |
| Partial failure | one bad record does not poison the whole run; run is marked `partial` with counts/errors |
| Heartbeat monitoring | if enabled, heartbeat reports recent Scout run health/summaries without executing the ingest path |
| Queue read models | discovered jobs appear in Inbox with recommendation metadata; shortlisted jobs move to Shortlist; archived jobs disappear from active queue |

## Non-obvious engineering note

**OpenClaw cron on Gateway is the preferred v1 scheduler because it runs next to the JobSpy MCP access path.**
Heartbeat should be used for monitoring/summaries, not as the primary fetch loop.
If a hosted scheduler is desired later, add it only after the JobSpy transport is reachable from that runtime.

The equally important architectural rule is this: **Scout should become the triage brain layered on top of deterministic ingest, not just a shell wrapper around fetch.**

---

## Milestone 2 — Needle tailoring engineering plan

## Proposed data model plan

### Keep
- `ResumeVersion`
- `TailoringRun`
- `Application`
- `ApplicationAttachment`
- `AuditEvent`

### Change

#### Add DB enum: `TailoringRunStatus`
Current schema stores `TailoringRun.status` as a raw string.

Recommended enum:
- `created`
- `generating`
- `generated_for_review`
- `edits_requested`
- `approved`
- `rejected`
- `paused`
- `failed`

#### `TailoringRun`
Add or harden fields:
- `status TailoringRunStatus`
- `fitAssessmentJson`
- `selectionJson`
- `strategyVersion`
- `promptVersion`
- `generationMetaJson`
- `revisionOfRunId` (optional but useful)

#### `ResumeVersion`
Already has:
- `renderedPdfUrl`
- `renderedDocxUrl`

For v2 planning:
- treat `renderedPdfUrl` as required for approved downstream-ready resumes
- treat `renderedDocxUrl` as explicitly non-v1
- optionally add `renderedPdfGeneratedAt`

## Proposed route/file plan

### Existing files to keep using
- `workers/needle/src/service.ts`
- `workers/needle/src/index.ts`
- `apps/web/app/(app)/tailoring/actions.ts`
- `apps/web/app/api/actions/tailoring/approve/route.ts`
- `apps/web/app/api/actions/tailoring/generate/route.ts`
- `apps/web/app/api/actions/tailoring/request-edits/route.ts`
- `apps/web/app/api/actions/tailoring/pause/route.ts`

### Files to add or revise
- `workers/needle/src/pdf.ts` (recommended)
- `workers/needle/src/select-base-resume.ts` (optional split if service grows)
- `packages/read-models/src/tailoring.ts`
- `apps/web/app/api/internal/needle/generate/route.ts` (optional if generation becomes backgrounded)
- `apps/web/app/api/resume-artifacts/[resumeVersionId]/route.ts` — revise to serve/redirect actual PDF when available

## Worker boundary

### `packages/tailoring`
Owns:
- base-resume selection rules
- tailored draft generation
- risk extraction
- markdown/document rendering helpers
- PDF render helpers

### `workers/needle/src/service.ts`
Owns:
- loading application/job/base resume context
- creating `TailoringRun`
- creating tailored `ResumeVersion`
- moving application state between `tailoring`, `tailoring_review`, and `applying`
- creating resume attachment pointer on approval

### `workers/needle/src/pdf.ts`
Owns:
- rendering/storing PDF artifact
- returning the final artifact URL/path for `renderedPdfUrl`

## Feature test cases

| Feature | Test cases |
|---|---|
| Base-resume selection | chooses expected base resume for known job fixtures; exposes reasons; handles no-strong-match case gracefully |
| Fit assessment | generates matched strengths/gaps/risk summary; does not hide unsupported requirements |
| Draft generation | creates `TailoringRun` + `ResumeVersion`; stores change summary and rationale; moves app into `tailoring_review` |
| Edit request loop | requesting edits creates a new run instead of mutating old history; revision note affects next draft intent |
| Approval handoff | approving run moves app to `applying`; selects tailored resume id; creates/updates resume attachment |
| PDF artifact | approved tailored resume has a real `renderedPdfUrl`; artifact route serves/redirects a PDF, not markdown text masquerading as a file |
| Truthfulness guardrails | unsupported requirements generate risks instead of invented claims |

## Non-obvious engineering note

The current artifact route is still markdown-first. That is acceptable only as a dev scaffold.
**Milestone 2 is not done until PDF is real.**

---

## Milestone 3 — Latch application ops engineering plan

## Proposed data model plan

### Keep
- `Application`
- `ApplicationAnswer`
- `ApplicationAttachment`
- `PortalSession`
- `ResumeVersion`
- `AuditEvent`

### Add

#### `ProfileAnswer`
Recommended fields:
- `id`
- `ownerUserId`
- `fieldKey`
- `fieldLabel`
- `fieldGroup`
- `answerJson`
- `sourceType`
- `confidence`
- `reviewState`
- `notes`
- `isArchived`
- timestamps

#### `ApplicationAnswer`
Recommended changes:
- add `profileAnswerId String?`
- add explicit `required Boolean @default(false)`
- keep flexible `answerJson` for value payloads
- optionally add `updatedByType` and `updatedByLabel`

#### `ApplicationAttachment`
Recommended additions:
- `contentType String?`
- `sizeBytes Int?`
- `checksum String?`

#### `PortalSession`
Recommended additions:
- `atsType String?`
- `lastInspectionJson Json?`
- `lastErrorJson Json?`

## Proposed route/file plan

### Existing files to keep using
- `apps/web/app/(app)/applications/[id]/actions.ts`
- `apps/web/app/(app)/applications/[id]/page.tsx`
- `apps/web/app/api/actions/applications/[applicationId]/status/route.ts`
- `packages/readiness/src/index.ts`

### Files to add
- `workers/latch/package.json`
- `workers/latch/src/index.ts`
- `workers/latch/src/service.ts`
- `workers/latch/src/readiness-sync.ts`
- `packages/read-models/src/applying.ts`
- `apps/web/app/api/actions/profile-answers/upsert/route.ts`
- `apps/web/app/api/actions/profile-answers/[profileAnswerId]/archive/route.ts`
- `apps/web/app/api/actions/applications/[applicationId]/answers/upsert/route.ts`
- `apps/web/app/api/actions/applications/[applicationId]/attachments/upsert/route.ts`
- `apps/web/app/api/actions/applications/[applicationId]/portal-sessions/upsert/route.ts`

## Worker boundary

### `packages/readiness`
Owns:
- blocker/warning taxonomy
- recommended next-action rules
- readiness score/calculation

### `workers/latch/src/service.ts`
Owns:
- answer upsert orchestration
- attachment upsert orchestration
- portal session upsert orchestration
- readiness recalculation/invalidation
- transition gating into `submit_review`

### `packages/read-models/src/applying.ts`
Owns:
- Applying queue summary query
- application detail read model shaping
- profile-answer library read model if UI needs it

## Feature test cases

| Feature | Test cases |
|---|---|
| Reusable profile answers | create/edit/archive reusable answer; copy/link into app answer; app override does not silently mutate profile default |
| Field-level answers | required answers are queryable explicitly; one-field update does not rewrite unrelated answers |
| Attachment integrity | selected tailored resume mismatch becomes blocker; correct PDF attachment clears blocker |
| Readiness engine | missing required answers block; blocked answers block; low-confidence answers warn; portal-session absence warns |
| Applying queue | completion/blocker counts update when answers/attachments/session state changes |
| Transition gate | ready app can move to `submit_review`; not-ready app cannot advance silently |
| Auditability | answer/attachment/session edits emit stable audit events |

## Non-obvious engineering note

Milestone 3 is the point where Browser Fill either becomes feasible or becomes a lie.
If reusable answers and field-level readiness stay sloppy here, M5 will be brittle no matter how clever the browser layer is.

---

## Milestone 4 — Submit Review and recording engineering plan

## Proposed data model plan

### Keep
- `Application`
- `ApplicationAnswer`
- `ApplicationAttachment`
- `PortalSession`
- `AuditEvent`

### Add

#### `SubmitReviewSnapshot`
Recommended fields:
- `id`
- `applicationId`
- `packetHash`
- `selectedResumeVersionId`
- `answersSnapshotJson`
- `attachmentsSnapshotJson`
- `portalSnapshotJson`
- `readinessSnapshotJson`
- `createdAt`

Purpose:
- freeze exactly what was under review when the app entered `submit_review`

#### `SubmissionRecord`
Recommended fields:
- `id`
- `applicationId`
- `submittedAt`
- `submitMethod`
- `portalUrlSnapshot`
- `portalDomainSnapshot`
- `externalReference`
- `confirmationText`
- `evidenceUrl`
- `packetHash`
- `createdByLabel`
- `createdAt`

#### `Application`
Recommended additions:
- `submitReviewFrozenAt`
- `submitReviewPacketHash`
- `submitReviewDirtyAt`

## Proposed route/file plan

### Existing files to keep using
- `apps/web/app/api/actions/applications/[applicationId]/status/route.ts` (may be split later)
- `apps/web/app/(app)/submit-review/page.tsx`

### Files to add
- `apps/web/app/api/actions/applications/[applicationId]/move-to-submit-review/route.ts`
- `apps/web/app/api/actions/applications/[applicationId]/return-to-applying/route.ts`
- `apps/web/app/api/actions/applications/[applicationId]/confirm-submission/route.ts`
- `packages/read-models/src/submit-review.ts`
- `workers/latch/src/submit-review.ts` (or fold into main Latch service if small)

## Worker boundary

### `workers/latch/src/submit-review.ts`
Owns:
- packet snapshot creation
- packet hash calculation
- dirty-state refresh when relevant fields change
- manual submission confirmation write path

### `packages/read-models/src/submit-review.ts`
Owns:
- Submit Review queue summaries
- detail view showing frozen vs current packet state

## Feature test cases

| Feature | Test cases |
|---|---|
| Packet freeze | moving to `submit_review` creates snapshot + packet hash |
| Dirty-state detection | changing answer/attachment/resume after freeze marks review stale |
| Return to applying | stale/problematic app can move back to `applying` cleanly |
| Manual submission record | user can confirm submitted with note/reference; record persists durably |
| Submitted audit trail | confirmation creates audit event and visible submission record |
| Review UX correctness | frozen packet and current packet differences are visible in read model |

## Non-obvious engineering note

Milestone 4 is what prevents the system from pretending that “ready internally” equals “safe to submit externally.”
That distinction must remain explicit.

---

## Milestone 5 — Browser Fill engineering plan

## Proposed data model plan

### Keep
- `PortalSession`
- `Application`
- `ApplicationAnswer`
- `ApplicationAttachment`
- `AuditEvent`

### Add

#### `PortalAutomationRun`
Recommended fields:
- `id`
- `portalSessionId`
- `atsType`
- `phase` (`inspect`, `fill`, `upload`, `review_handoff`)
- `status` (`created`, `in_progress`, `completed`, `partial`, `failed`, `cancelled`)
- `fieldInventoryJson`
- `mappingSummaryJson`
- `fillSummaryJson`
- `unsupportedFieldsJson`
- `errorSummaryJson`
- timestamps

#### `PortalEvidence`
Recommended fields:
- `id`
- `portalSessionId`
- `automationRunId`
- `kind` (`screenshot`, `html_snapshot`, `field_summary`, `upload_receipt`)
- `url`
- `summaryJson`
- `createdAt`

#### `PortalSession`
Recommended additions:
- `atsType`
- `lastInspectionAt`
- `lastAutomationRunAt`
- `lastErrorJson`
- `lastFillSummaryJson`

## Proposed route/file plan

### Files to add
- `packages/automation/src/index.ts`
- `packages/automation/src/shared/field-classifier.ts`
- `packages/automation/src/shared/mapping-engine.ts`
- `packages/automation/src/greenhouse/adapter.ts`
- `packages/automation/src/greenhouse/selectors.ts`
- `workers/latch/src/portal/index.ts`
- `workers/latch/src/portal/service.ts`
- `apps/web/app/api/actions/applications/[applicationId]/portal/inspect/route.ts`
- `apps/web/app/api/actions/applications/[applicationId]/portal/fill/route.ts`
- `apps/web/app/api/actions/applications/[applicationId]/portal/refresh/route.ts`
- `tests/browser-harness/greenhouse/*`

### Route responsibilities

#### `portal/inspect`
- launch inspection-only pass
- record field inventory
- do not fill anything

#### `portal/fill`
- run supported fill primitives
- upload selected tailored PDF artifact
- stop before submit

#### `portal/refresh`
- refresh session state/evidence after manual interaction or retry

## Worker boundary

### `packages/automation/src/greenhouse/*`
Owns:
- Greenhouse-specific selectors and adapter logic
- provider capability knowledge

### `packages/automation/src/shared/*`
Owns:
- generic field classification
- generic mapping helpers
- common fill abstractions

### `workers/latch/src/portal/service.ts`
Owns:
- orchestration of inspection/fill/upload phases
- portal-session lifecycle updates
- run/evidence persistence
- handoff back into Submit Review state

## Feature test cases

| Feature | Test cases |
|---|---|
| Field inspection | extracts text/select/radio/checkbox/file inputs from harness forms; marks required fields correctly |
| Mapping confidence | high-confidence values auto-map; low-confidence values are surfaced but not blindly filled |
| Safe fill | supported Greenhouse fields are filled; unsupported fields remain listed clearly |
| PDF upload | selected tailored PDF artifact uploads successfully; wrong/missing artifact becomes blocker |
| Evidence capture | screenshot/field summary evidence is written for each run |
| Review boundary | automation never presses final submit; leaves portal session `ready_for_review` when appropriate |
| Regression safety | Greenhouse harness regression tests catch selector/field-classification drift |

## Non-obvious engineering note

The browser architecture must be **Greenhouse-first but not Greenhouse-trapped**.
That means:
- prove one real adapter end-to-end first
- keep shared field/mapping/fill abstractions in `packages/automation`
- do not smear Greenhouse-specific assumptions across all of Latch

---

## Recommended environment/config contract

These values should exist as env/config rather than hardcoded source assumptions.

### Scout
- `SCOUT_SOURCE=jobspy_mcp`
- `SCOUT_BOARD=indeed`
- `JOBSPY_MCP_URL` or equivalent transport configuration
- a stable repo-owned Scout run entrypoint (for example `scripts/scout-run.ts`)
- OpenClaw cron job configuration in Gateway pointing to the Scout run workflow/entrypoint
- initial active search profile: role/search term `Data Analyst`, location `New York City`
- initial schedule: weekdays at `8:00 AM America/New_York`, plus Sunday `6:00 PM America/New_York` for backfill
- archive policy: `archived` means suppress forever
- Scout triage policy/version config (for example `SCOUT_TRIAGE_POLICY_VERSION`)
- optional confidence threshold config for shortlist/archive/human-review routing

### Heartbeat (optional Scout monitoring)
- no heartbeat dependency is required for the first Scout implementation pass
- if enabled later, heartbeat should inspect recent Scout run health instead of executing the ingest path

### Tailoring / artifacts
- object-storage bucket/container config for PDF artifacts
- signed URL or proxy delivery configuration

### Browser fill
- browser runtime/session config
- any Greenhouse harness/test URL configuration

---

## Recommended near-term implementation order

1. Finish Milestone 1 with the new checklist doc
2. During/after Milestone 1, extract Scout read models and formalize test scaffolding
3. In Milestone 2, convert `TailoringRun.status` from string to enum and make PDF artifact real
4. In Milestone 3, create `ProfileAnswer` and a real `workers/latch` boundary
5. In Milestone 4, add packet freeze + submission records explicitly
6. In Milestone 5, build Greenhouse harness first, then real adapter, then real fill

## Final recommendation

Use this v2 engineering addendum as the practical bridge between roadmap specs and actual tickets/PRs.

The key idea is simple:
- keep the DB and read-model contracts explicit
- keep long-running work in workers
- keep browser automation behind good state
- keep the final submit click human
