# Milestone 1 — Scout Implementation Checklist v1

_Status: canonical implementation checklist_
_Last updated: 2026-03-25_

## Purpose

Translate `specs/milestone-1-scout-automation-and-triage-v1.md` into an implementation-oriented checklist tied to the repo as it exists today.

This is the build sheet for turning the current thin Scout vertical slice into a real scheduled ingestion + triage lane using:
- JobSpy MCP as the adapter path
- Indeed as the first live source
- Benny's `job-search-spec.md` as the broader preference source
- an intentionally narrow active v1 search profile: `Data Analyst` in `New York City`
- OpenClaw cron on Gateway as the v1 scheduler
- a Scout decision pass that can `shortlist`, `archive`, `defer`, or `needs_human_review`
- no heartbeat dependency for the first implementation pass

## Related docs

- `specs/milestone-1-scout-automation-and-triage-v1.md`
- `specs/roadmap-milestones-v1.md`
- `specs/shared-architecture-v1.md`
- `specs/roadmap-engineering-v2.md`

## Locked operating inputs for first implementation pass

### Search profile source
- Use Benny's current `job-search-spec.md` as the broader human preference source.
- For Milestone 1 implementation, do **not** activate the whole search space yet.

### Active v1 Scout profile
- board/source: Indeed via JobSpy MCP
- role/search term: `Data Analyst`
- location: `New York City`
- rationale: start narrow to validate the ingestion lane and keep Inbox quality manageable

### Schedule
- weekdays at `8:00 AM America/New_York`
- Sunday `6:00 PM America/New_York` backfill run

### Heartbeat policy
- do not depend on heartbeat for Scout in the first implementation pass
- if heartbeat support is added later, it should summarize recent run health only

### Archive behavior
- `archived` means suppress forever in v1
- repeated sightings may still update provenance/run history behind the scenes, but must not re-surface archived jobs automatically

### Scout decision policy direction
- Scout should run a post-ingest decision pass after deterministic fetch/normalize/dedupe completes.
- Decision verdicts should be `shortlist`, `archive`, `defer`, or `needs_human_review`.
- Ambiguous jobs should remain visible for review instead of being silently acted on.
- Conservative auto-action is allowed in v1, but only with explicit confidence thresholds, ambiguity flags, and auditability.
- Recommended initial policy shape:
  - strong positive + no blocking ambiguity -> eligible for `shortlist`
  - strong negative + no contradictory positives -> eligible for `archive`
  - promising but mixed signal -> `needs_human_review`
  - weak/incomplete signal -> `defer`

## Current repo snapshot

Relevant files that already exist:
- `packages/db/prisma/schema.prisma`
- `packages/domain/src/scout.ts`
- `workers/scout/index.ts`
- `apps/web/app/(app)/jobs/actions.ts`
- `apps/web/app/api/actions/scout/run-sample/route.ts`
- `apps/web/lib/queries.ts`
- `scripts/scout-seed.ts`
- `scripts/scout-validate.ts`

Current Scout strengths:
- canonical `Job`, `ScrapeRun`, `JobSourceRecord`, `JobSourceLink`, `JobScorecard`, and `AuditEvent` records exist
- normalization, work-mode inference, and heuristic scoring exist in `packages/domain/src/scout.ts`
- a working ingestion flow exists in `workers/scout/index.ts`
- a stable scheduled entrypoint exists via `scripts/scout-run.ts` and `scripts/scout-run-gateway.sh`
- a real JobSpy MCP adapter seam exists and has been validated against the host-side endpoint
- Gateway cron is already wired on the current host
- Scout run ops visibility exists via `/scout-runs`

Current Scout gaps:
- run state is still too thin for real ops (`created/completed/failed` only)
- trigger semantics are still partially hidden in notes rather than first-class structured fields
- no persisted `ScoutDecision` model exists yet
- no explicit ambiguity handling / human-review routing layer exists yet
- no run idempotency key for duplicate scheduler delivery
- no feedback/override capture comparing Scout recommendations to Benny’s final actions
- no test harness directories currently exist in the repo
- `packages/read-models` exists, but Scout queue/run read logic still lives partially in `apps/web/lib/queries.ts`

## Critical runtime note

**OpenClaw cron on Gateway is the preferred v1 runtime for Scout.**

Why:
- it can run on the same machine/environment that already has JobSpy MCP access
- it avoids forcing hosted Vercel functions to reach a possibly local-only MCP transport
- it pairs cleanly with heartbeat for monitoring and summaries

Preferred v1 shape:
- a Gateway cron job runs on schedule
- the cron job triggers a stable Scout entrypoint on the host/shared repo
- the Scout entrypoint calls the shared Scout service
- the initial live schedule is weekdays at `8:00 AM America/New_York`, plus Sunday `6:00 PM America/New_York` for backfill
- heartbeat is not part of the first implementation pass

Vercel cron may still be added later, but it is no longer the primary assumption for v1.

**Do not let scheduler/runtime details leak into the core domain/data model.**
The Scout service boundary should hide whether the caller was Gateway cron, manual run, backfill, heartbeat summary, or a future hosted scheduler.

## Definition of done

Milestone 1 is done when all of these are true:
- OpenClaw/Gateway cron can trigger a scheduled Scout run safely
- Scout can fetch from JobSpy MCP with Indeed as the first real source
- the initial live profile is narrowed to `Data Analyst` in `New York City`
- repeated runs dedupe correctly
- archived jobs stay suppressed forever unless Benny changes policy later
- canonical jobs retain provenance to raw source records
- Scout decisions are persisted with verdict/confidence/reasons/ambiguity fields
- ambiguous jobs remain human-reviewable instead of being silently acted on
- Inbox and Shortlist are driven by Scout-created jobs and Scout recommendations
- recent Scout runs are visible without shell access
- failures and partial runs are auditable and diagnosable
- the Scout path has unit + integration + smoke coverage

---

## P0 — Schema hardening

### Goal
Upgrade the current Scout data model so it can support real scheduled ingestion, run telemetry, partial failure handling, and persisted Scout decisions.

### Proposed schema deltas relative to current `packages/db/prisma/schema.prisma`

#### 1. Expand `ScrapeRunStatus`
Current:
- `created`
- `completed`
- `failed`

Target:
- `created`
- `fetching`
- `processing`
- `completed`
- `partial`
- `failed`
- `cancelled`

#### 2. Add `ScrapeRunTriggerType`
Add a new enum:
- `scheduled`
- `manual`
- `backfill`
- `test`

#### 3. Expand `JobSourceRecordStatus`
Current:
- `captured`
- `normalized`
- `deduped`
- `rejected`

Target:
- `captured`
- `normalized`
- `deduped`
- `rejected`
- `errored`

#### 4. Harden `ScrapeRun`
Keep the existing table/model, but add fields needed for real ops.

Recommended fields to add:
- `triggerType ScrapeRunTriggerType @default(manual)`
- `boardKey String?` — first value should be `indeed`
- `idempotencyKey String?`
- `fetchedCount Int @default(0)`
- `capturedCount Int @default(0)`
- `normalizedCount Int @default(0)`
- `rejectedCount Int @default(0)`
- `erroredCount Int @default(0)`
- `warningsJson Json?`
- `errorSummaryJson Json?`
- `adapterVersion String?`

Recommended indexes/constraints:
- `@@index([sourceKey, startedAt])`
- `@@index([triggerType, startedAt])`
- unique constraint on `idempotencyKey` only if the implementation guarantees a stable non-null value

Notes:
- existing `resultCount` can remain for backwards compatibility if it is treated as the raw fetched record count
- `createdJobCount` and `dedupedCount` already exist and should be preserved

#### 5. Harden `JobSourceRecord`
Recommended additions:
- `boardKey String?`
- `payloadHash String?`
- `dedupeKey String?`
- `seenAt DateTime @default(now())`
- `rejectionReason String?`
- `errorMessage String?`

Recommended indexes:
- `@@index([sourceKey, boardKey, sourceRecordId])`
- `@@index([payloadHash])`
- `@@index([dedupeKey])`

#### 6. Light-touch `JobScorecard` addition
Recommended:
- `scorerVersion String?`

This is useful once scoring rules change over time.

#### 7. Add `ScoutDecision`
Recommended enums:
- `ScoutDecisionVerdict`
  - `shortlist`
  - `archive`
  - `defer`
  - `needs_human_review`
- `ScoutDecisionSource`
  - `heuristic`
  - `agent`
  - `hybrid`

Recommended fields:
- `jobId`
- `scrapeRunId?`
- `verdict`
- `decisionSource`
- `confidence`
- `reasonSummary?`
- `reasonsJson`
- `ambiguityFlagsJson`
- `policyVersion`
- `actedAutomatically @default(false)`
- timestamps

Recommended indexes:
- `@@index([jobId, createdAt])`
- `@@index([scrapeRunId, createdAt])`

### Schema checklist

- [ ] Update enums in `packages/db/prisma/schema.prisma`
- [ ] Add `ScrapeRunTriggerType`
- [ ] Add run telemetry fields to `ScrapeRun`
- [ ] Add error/dedupe helper fields to `JobSourceRecord`
- [ ] Add `scorerVersion` to `JobScorecard`
- [ ] Add `ScoutDecision` + enums for verdict/source
- [ ] Generate migration in `packages/db/prisma/migrations/`
- [ ] Run local migration and seed successfully
- [ ] Re-run build/typecheck after migration

---

## P1 — Domain hardening

### Goal
Make Scout normalization, dedupe, scoring, decisioning, and run bookkeeping explicit and reusable.

### Files to edit

#### `packages/domain/src/scout.ts`
Expand this file so it owns more of the deterministic Scout logic instead of letting the worker improvise it inline.

Recommended additions:
- normalized adapter input type that includes `boardKey`
- stable `dedupeKey` builder
- stable payload-hash helper
- canonical run-summary/result-count helper
- scorer version constant
- explainable match-result type for dedupe decisions

Recommended exported helpers:
- `normalizeScoutJob(...)`
- `scoreScoutJob(...)`
- `buildScoutPayloadHash(...)`
- `buildScoutDedupeKey(...)`
- `classifyScoutMatch(...)`
- `summarizeScoutRun(...)`

#### Create: `packages/domain/src/scout-triage.ts`
Owns the post-ingest Scout decision logic.

Recommended additions:
- verdict classification helpers
- ambiguity-flag generation
- conservative auto-action eligibility rules
- policy/version constants
- decision-summary helper types

Recommended exported helpers:
- `decideScoutVerdict(...)`
- `classifyScoutAmbiguities(...)`
- `shouldAutoApplyScoutDecision(...)`
- `summarizeScoutDecision(...)`

#### `packages/domain/src/audit.ts`
Add or formalize Scout event constants/helpers so event names stop drifting ad hoc.

Recommended Scout event set:
- `scout.run_started`
- `scout.run_completed`
- `scout.run_partial`
- `scout.run_failed`
- `job.discovered`
- `job.source_record_linked`
- `scout.decision_created`
- `scout.decision_auto_applied`
- `scout.decision_overridden`
- `job.shortlisted`
- `job.archived`

### Domain checklist

- [ ] Expand `packages/domain/src/scout.ts` to cover run/dedupe helper logic, not just normalization and scoring
- [ ] Create `packages/domain/src/scout-triage.ts` for decision verdicts / ambiguity / auto-action policy
- [ ] Add stable event-name helpers/constants in `packages/domain/src/audit.ts`
- [ ] Add a `SCOUT_SCORER_VERSION` constant
- [ ] Add a `SCOUT_TRIAGE_POLICY_VERSION` constant
- [ ] Ensure dedupe decisions are explainable as structured values, not only implied by SQL lookups
- [ ] Preserve raw-source vs canonical-job separation in types

---

## P2 — Worker/service split

### Goal
Move Scout from a single inline loop into a layered service shape that can support cron, manual runs, future backfills, and a post-ingest Scout decision pass.

### Current state
`workers/scout/index.ts` currently:
- creates a run
- iterates records
- normalizes/scorers inline
- writes DB records directly
- completes the run
- does not yet persist a separate Scout decision layer

That is fine for a thin slice, but too coupled for scheduled production use.

### Target file layout

Keep `workers/scout/index.ts` as a thin re-export shim for compatibility, but move real code under `workers/scout/src/`.

Recommended new files:
- `workers/scout/src/index.ts`
- `workers/scout/src/service.ts`
- `workers/scout/src/adapters/jobspy-mcp.ts`
- `workers/scout/src/types.ts`
- `workers/scout/src/idempotency.ts`
- `workers/scout/src/decision.ts`

### Responsibility split

#### `workers/scout/src/adapters/jobspy-mcp.ts`
Owns:
- fetching raw records from JobSpy MCP
- Indeed-specific request shaping for v1
- upstream transport error handling
- mapping raw adapter results into the canonical Scout input contract

Does not own:
- DB writes
- dedupe policy
- scorecard policy
- UI-facing read models

#### `workers/scout/src/service.ts`
Owns:
- creating/updating `ScrapeRun`
- calling the adapter
- capturing `JobSourceRecord`s
- deduping into canonical `Job`
- writing `JobScorecard`s
- invoking the Scout decision pass for candidate jobs
- emitting audit events
- producing run counts/status

#### `workers/scout/src/decision.ts`
Owns:
- selecting candidate jobs for decisioning after ingest
- persisting `ScoutDecision` rows
- deciding whether safe auto-actions should be applied
- recording decision/override audit events

#### `workers/scout/src/idempotency.ts`
Owns:
- building a stable idempotency key from source/query/date-window
- preventing duplicate cron delivery from creating duplicate runs unnecessarily

### Worker checklist

- [ ] Create `workers/scout/src/` structure
- [ ] Move current ingestion logic out of `workers/scout/index.ts`
- [ ] Build a JobSpy MCP adapter module with Indeed as the first board
- [ ] Introduce adapter boundary types so future sources are additive
- [ ] Add a dedicated decision module that persists `ScoutDecision` rows after ingest
- [ ] Add idempotency-key generation/check logic for scheduled runs
- [ ] Emit run-start / run-complete / run-fail audit events
- [ ] Emit Scout decision / auto-apply / override audit events
- [ ] Mark partial runs as `partial` rather than pretending they completed cleanly
- [ ] Keep `workers/scout/index.ts` as a stable export shim

---

## P3 — Scheduler and ops surface hardening

### Goal
Support OpenClaw/Gateway cron scheduling and run visibility without bloating the UI request path.
The initial scheduled profile should be explicit, narrow, and easy to inspect/debug.

### Files to create or edit

#### Create: `scripts/scout-run.ts`
Purpose:
- stable repo-owned Scout entrypoint for scheduled execution
- invoked from OpenClaw/Gateway cron on the host that has JobSpy MCP access
- runs the configured Indeed Scout pass through the shared Scout service
- exits with structured success/failure output for logs/debugging

Recommended invocation shape:
- host-side script or npm script wrapper
- suitable for isolated Gateway cron runs
- should accept trigger metadata such as `scheduled`, `manual`, `backfill`, `test`
- should accept or derive the initial active profile (`Data Analyst`, `New York City`, `indeed`) without hardcoding future multi-profile assumptions into the first pass

Recommended output shape:
- run id
- trigger type
- source/board
- counts/status summary
- Scout decision summary counts (for example shortlisted / archived / needs_human_review / deferred)

#### Optional create: `scripts/scout-health.ts`
Purpose:
- inspect recent Scout runs
- provide lightweight health/summary output for heartbeat checks or cron debugging

#### Optional create: `apps/web/app/api/internal/scout/run/route.ts`
Purpose:
- manual/admin/internal trigger endpoint that uses the same service path as the script entrypoint
- useful for future hosted schedulers, backfills, and debugging

#### Edit: `apps/web/app/(app)/jobs/actions.ts`
Current role:
- UI server actions directly invoke `runScoutIngestion(...)`

Target role:
- keep sample/manual testing helpers if useful
- use the same core Scout service boundary as the scheduled entrypoint
- avoid drifting into a separate implementation path

#### Create: `apps/web/app/(app)/scout-runs/page.tsx`
Purpose:
- minimal Scout ops page
- show recent runs, counts, source/board, status, first error summary

#### Optional create: `apps/web/app/(app)/scout-runs/[runId]/page.tsx`
Purpose:
- run detail / ops debugging surface
- show source-record counts, errors, and linked created jobs

### Scheduler/ops checklist

- [ ] Create a stable scheduled Scout entrypoint under `scripts/scout-run.ts`
- [ ] Define the OpenClaw/Gateway cron job shape that calls the Scout entrypoint
- [ ] Configure the first live schedule as weekdays at `8:00 AM America/New_York`, plus Sunday `6:00 PM America/New_York` for backfill
- [ ] Configure the first live Scout profile as `Data Analyst` in `New York City` on Indeed via JobSpy MCP
- [ ] Decide whether to also create `app/api/internal/scout/run/route.ts` for future hosted/manual use
- [ ] Refactor server actions in `app/(app)/jobs/actions.ts` to share the new Scout service path
- [ ] Add a Scout run history page
- [ ] Add link/navigation to the Scout run surface from the app shell or Activity page
- [ ] Ensure scheduled Scout runs are isolated from casual chat/session noise
- [ ] Keep heartbeat out of scope for the first implementation pass

---

## P4 — Read model extraction

### Goal
Move Scout query logic into `packages/read-models` so `apps/web` stops becoming the permanent home for every query.

### Files to edit/create

#### Create: `packages/read-models/src/scout.ts`
Move in:
- Inbox queries
- Shortlist queries
- Scout recommendation / human-review queue queries
- Scout run summary queries
- optional run-detail query

#### Edit: `packages/read-models/src/index.ts`
Export Scout read-model functions.

#### Edit: `packages/contracts/src/index.ts`
Add schemas for:
- `scoutRunSummary`
- `scoutRunDetail`
- `scoutRunCounts`
- `scoutDecisionSummary`

#### Edit: `apps/web/lib/queries.ts`
Short-term options:
- delegate Scout queue/run queries to `@job-ops/read-models`, or
- gradually retire Scout-specific query logic from this file

### Read model checklist

- [ ] Create `packages/read-models/src/scout.ts`
- [ ] Add Scout run summary/detail schemas to `packages/contracts/src/index.ts`
- [ ] Export Scout read models from `packages/read-models/src/index.ts`
- [ ] Update `apps/web/lib/queries.ts` to delegate to `@job-ops/read-models`
- [ ] Keep UI pages thin and read-model-driven

---

## P5 — Tests and fixtures

### Goal
Create enough test structure that Scout can change without constant fear.

### Current gap
The repo currently has no real `tests/` directory even though the architecture docs expect one.

### Recommended directories
Create:
- `tests/fixtures/scout/`
- `tests/integration/scout/`

Recommended unit-test files:
- `packages/domain/src/scout.test.ts`
- `packages/domain/src/scout-triage.test.ts`
- `workers/scout/src/service.test.ts`
- `workers/scout/src/decision.test.ts`
- `workers/scout/src/jobspy-mcp-adapter.test.ts`

### Fixture sets to create

#### Fixture set A — happy path Indeed records
Use a small stable set of realistic Indeed-like records.

Cover:
- normal analytics role
- remote role
- hybrid role
- one record with salary
- one record without salary

#### Fixture set B — duplicate/repeat sightings
Cover:
- exact same source record twice
- same URL with slightly different description
- same logical job with changed title punctuation

#### Fixture set C — partial bad data
Cover:
- missing company name
- missing title
- malformed date
- missing URL
- very thin description

#### Fixture set D — ambiguous triage cases
Cover:
- title looks weak but description looks strong
- location mismatch with remote/hybrid hints
- promising role with incomplete compensation/seniority signal
- archived-like reappearance with changed details

### Test checklist

- [ ] Create `tests/fixtures/scout/` with realistic adapter payloads
- [ ] Add domain tests for normalization and dedupe helpers
- [ ] Add worker/service tests for run bookkeeping and partial failure handling
- [ ] Add adapter-mapping tests for JobSpy MCP -> canonical record translation
- [ ] Add decision tests for verdict/confidence/ambiguity classification
- [ ] Add an integration test covering the initial narrow profile (`Data Analyst`, `New York City`, `indeed`)
- [ ] Add an integration test that archived jobs stay suppressed on repeat sightings
- [ ] Add an integration test that ambiguous jobs remain human-reviewable
- [ ] Add an integration test that high-confidence jobs can auto-route conservatively
- [ ] Add at least one integration test that replays the same run twice and asserts no duplicate job creation
- [ ] Add at least one manual smoke script for local validation

### Minimum manual smoke checklist

- [ ] Trigger a manual Scout run against the initial narrow live profile (`Data Analyst`, `New York City`, `indeed`)
- [ ] Trigger the same run twice and verify dedupe counts increase instead of job creation
- [ ] Archive one discovered job, trigger another matching run, and verify the archived job stays suppressed
- [ ] Confirm fresh jobs get Scout decisions with verdict/confidence/reasons
- [ ] Confirm at least one ambiguous job remains human-reviewable rather than silently auto-acted on
- [ ] Confirm a high-confidence job can auto-route conservatively if policy is enabled
- [ ] Confirm new jobs appear in Inbox
- [ ] Shortlist one job and confirm it appears in Shortlist
- [ ] Open the Scout run history page and confirm counts/status are visible
- [ ] Force at least one malformed record and confirm the run is `partial` or `failed`, not falsely `completed`

---

## File-by-file plan

| Path | Action | Why |
|---|---|---|
| `packages/db/prisma/schema.prisma` | edit | add trigger/status/count/error fields for real Scout ops |
| `packages/db/prisma/migrations/*` | create | persist schema changes |
| `packages/domain/src/scout.ts` | edit | canonical normalization/dedupe/run-summary helpers |
| `packages/domain/src/scout-triage.ts` | create | Scout verdict/confidence/ambiguity policy helpers |
| `packages/domain/src/audit.ts` | edit | stable Scout event taxonomy |
| `workers/scout/index.ts` | edit | keep as thin export shim |
| `workers/scout/src/index.ts` | create | public worker/service exports |
| `workers/scout/src/service.ts` | create | orchestrate run lifecycle |
| `workers/scout/src/adapters/jobspy-mcp.ts` | create | JobSpy MCP + Indeed adapter |
| `workers/scout/src/types.ts` | create | local worker types/input contracts |
| `workers/scout/src/idempotency.ts` | create | stable scheduled-run idempotency key logic |
| `workers/scout/src/decision.ts` | create | persist Scout decisions and conservative auto-actions |
| `scripts/scout-run.ts` | create | stable Scout entrypoint for OpenClaw/Gateway cron |
| `scripts/scout-health.ts` | optional create | lightweight Scout run health summary for heartbeat/debugging |
| `apps/web/app/api/internal/scout/run/route.ts` | optional create | internal/manual/future-hosted trigger path |
| `apps/web/app/(app)/jobs/actions.ts` | edit | keep UI-triggered runs aligned with core service path |
| `apps/web/app/(app)/scout-runs/page.tsx` | create | minimal run ops surface |
| `packages/contracts/src/index.ts` | edit | add run summary/detail schemas |
| `packages/read-models/src/scout.ts` | create | Scout-specific queue/run/decision read models |
| `packages/read-models/src/index.ts` | edit | export Scout read models |
| `apps/web/lib/queries.ts` | edit | delegate Scout reads to package-level read models |
| `scripts/scout-seed.ts` | edit | keep as sample/dev path only |
| `scripts/scout-validate.ts` | edit | expand to validate run visibility + counts |
| `tests/fixtures/scout/*` | create | realistic fixture payloads |
| `tests/integration/scout/*` | create | integration coverage |

---

## Recommended build order

1. Schema delta + migration
2. Domain helper expansion for scoring + Scout triage decisions
3. Worker split into adapter/service/idempotency/decision layers
4. Persist Scout decisions + conservative auto-action rules
5. Read-model extraction for Scout queue + recommendation views
6. Gateway cron entrypoint + scheduled job wiring
7. Scout run ops page + decision visibility
8. Tests + smoke scripts
9. Gateway cron smoke validation

## Exit check

Do not call Milestone 1 complete until all boxes are true:
- [ ] JobSpy MCP -> Indeed path works through the chosen execution transport
- [ ] OpenClaw/Gateway cron job is scheduled and working on the host with JobSpy MCP access
- [ ] the initial live profile is `Data Analyst` in `New York City`
- [ ] duplicate scheduled delivery is safe enough
- [ ] archived jobs remain suppressed on repeat sightings
- [ ] Scout decisions are persisted with structured verdict/confidence/reasons/ambiguity fields
- [ ] ambiguous jobs remain human-reviewable
- [ ] conservative auto-actions are auditable and policy-versioned
- [ ] Scout run history is visible in-app
- [ ] partial failure handling is real
- [ ] dedupe is explainable
- [ ] at least one integration test covers rerun/dedupe behavior
- [ ] at least one integration test covers Scout decision routing behavior
- [ ] at least one manual smoke run has been performed from the Gateway/host execution path
