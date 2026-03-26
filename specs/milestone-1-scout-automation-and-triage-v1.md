# Milestone 1 — Scout Automation and Triage Backbone v1

_Status: canonical milestone spec_
_Last updated: 2026-03-25_

## Purpose

Make the top of the funnel real.

By the end of this milestone, jobs should arrive automatically on a schedule, land in Postgres with durable provenance, dedupe cleanly, and receive structured Scout decisions that determine whether they should be shortlisted, archived, deferred, or surfaced for human review.

This milestone turns Scout from a demo/manual ingest flow into a real discovery + triage lane.

## Primary user outcome

Benny should be able to wake up, open the app, and see fresh jobs that:
- came from real runs rather than hand-entered demo data
- are not duplicated every time Scout runs
- have visible provenance and fit rationale
- carry a visible Scout recommendation with confidence and reasons
- automatically move only when Scout is highly confident, while ambiguous jobs remain visible for review

## Locked v1 decisions

- Scout v1 will use a JobSpy MCP-backed source adapter.
- Indeed is the first real source to prioritize.
- The human preference source is Benny's `job-search-spec.md`, but the active v1 Scout configuration starts narrowly with `Data Analyst` in `New York City`.
- OpenClaw cron on Gateway is the selected v1 scheduler runtime for Scout.
- Initial schedule: weekdays at `8:00 AM America/New_York`, plus a Sunday `6:00 PM America/New_York` backfill run.
- Heartbeat is intentionally not part of the core Scout v1 ingest/alert path yet.
- In v1, `archived` means suppress forever; repeated sightings should preserve provenance but should not automatically re-surface archived jobs.
- Scout should own a post-ingest decision pass with explicit verdicts (`shortlist`, `archive`, `defer`, `needs_human_review`) and ambiguity handling.
- Any auto-action policy in v1 should be conservative and auditable rather than silently acting on gray-zone jobs.
- The adapter boundary must stay generic enough that other sources can be added later without redesigning the core ingestion model.

## In scope

### 1. Scheduled ingestion
Build a real scheduling entry path for Scout runs.

Selected v1 runtime:
- OpenClaw / Gateway cron running on the machine that already has JobSpy MCP access

Companion monitoring:
- no heartbeat-based Scout monitoring is required for the first implementation pass
- if heartbeat monitoring is enabled later, it should inspect recent run health rather than perform the core fetch path itself

Requirements:
- schedule cadence must be configurable, not hardcoded in source
- the initial v1 schedule should be configured as weekdays at `8:00 AM America/New_York`, plus a Sunday `6:00 PM America/New_York` backfill run
- the scheduled job should run in an isolated or otherwise low-noise mode so recurring ingest does not clutter the main conversational session
- scheduled runs must be idempotent enough to tolerate retries or duplicate scheduler delivery
- manual run must still be possible for debugging and backfills
- scheduled vs manual vs backfill triggers must be distinguishable in run records

### 2. Source adapter contract
Create a stable adapter boundary so Scout is not tightly coupled to one prototype script.

For v1, the first concrete implementation should be a JobSpy MCP-backed adapter with Indeed prioritized as the first live source.
The initial active profile should use Benny's broader `job-search-spec.md` only as a preference source, while the runtime search configuration starts narrowly with a single role cluster (`Data Analyst`) and a single location (`New York City`).

The adapter contract should normalize:
- source key
- source record id
- source URL
- company name
- title
- location
- description/raw content
- compensation text if present
- remote/hybrid indicators if present
- date posted / first seen if available
- source query context
- upstream provider / board identity (for example `indeed` via JobSpy)

This should allow:
- one provider now
- multiple providers later
- manual import / pasted records without special-case hacks
- JobSpy-specific details to stay at the adapter edge instead of leaking into canonical job semantics

### 3. Run ledger and provenance
Every ingestion run should create a durable run record.

`scout` / ingestion ownership should visibly track:
- when a run started/finished
- what triggered it
- what query/location/source config it used
- how many records were fetched
- how many were created vs deduped vs errored vs ignored
- parser/normalizer version when meaningful
- run-level errors and warnings

Raw source records should remain append-only reference material.
They should not be overwritten in place after normalization.

### 4. Normalization and dedupe
Implement canonical normalization and dedupe rules for jobs.

Requirements:
- dedupe should work across repeated runs of the same source
- dedupe should be explainable, not a black box
- canonical job records should be distinct from raw source records
- when a source record maps to an existing job, link it instead of duplicating the job
- repeated sightings should refresh “last seen” style metadata without losing provenance

### 5. Scorecards and prioritization
Generate usable first-pass scorecards for triage.

The scorecard does not need Needle-grade fit assessment yet.
It does need to provide:
- priority score
- top reasons
- visible risks/gaps
- enough explanation that Benny can understand why a job surfaced highly

### 6. Scout decision pass
After deterministic ingestion finishes, Scout should run a structured decision pass over new or materially changed jobs.

Required outputs per decision:
- `verdict` (`shortlist`, `archive`, `defer`, `needs_human_review`)
- confidence
- top reasons
- ambiguity flags when the job is not safe to auto-act on
- policy/version metadata sufficient to explain the recommendation later
- whether the system auto-applied the decision or only recorded a recommendation

Requirements:
- deterministic ingest should remain separate from Scout judgment
- ambiguous cases should be treated as a first-class outcome, not as an error or silent fallback
- high-confidence jobs may be auto-shortlisted or auto-archived conservatively
- low-confidence or mixed-signal jobs should remain human-reviewable

### 7. Inbox and Shortlist read models
The UI should expose real DB-backed Scout outputs.

Required views:
- Inbox: discovered jobs awaiting decision
- Shortlist: kept jobs ready for downstream work

Required actions:
- shortlist
- archive
- open job details or next handoff target

### 8. Audit trail
All meaningful actions should emit audit events.

Required event categories:
- scrape run started/completed/failed
- source record captured
- job discovered
- job deduped / source record linked
- scout decision created
- scout decision auto-applied
- scout decision overridden
- job shortlisted
- job archived

## Strongly recommended additions

These are not strictly required to hit the milestone, but will make later phases significantly cleaner.

### A. Minimal run-ops surface
Add a very small run history/debug surface for Scout.

Suggested visibility:
- latest runs
- status
- counts
- top error summaries
- last successful run per source

This reduces shell-only debugging.

### B. Explicit freshness and staleness policy
Define when jobs become stale or should stop surfacing prominently.

Suggested fields/behavior:
- `firstSeenAt`
- `lastSeenAt`
- `postedAt` if available
- optional stale flag or freshness bucket

### C. Ignore / suppress mechanism
In v1, `archived` should mean “suppress forever.”

Requirements:
- if Benny archives a job, Scout should not automatically re-surface it on later sightings
- later sightings of the same archived job may still update provenance/run history behind the scenes if useful for ops/debugging
- archived suppression should be intentional and visible in the data model/audit trail rather than emerging accidentally from UI filtering alone

### D. Feedback capture and override visibility
Scout becomes more useful only if its recommendations are visible and comparable against what Benny actually does.

Recommended v1 support:
- preserve the latest Scout recommendation for a job
- surface whether Benny’s eventual action matched or overrode Scout
- keep this history queryable via decision records and/or audit events rather than relying on memory or chat context

## Out of scope

Do not build in this milestone:
- opaque unsupervised auto-triage with no confidence thresholds, ambiguity flags, or audit trail
- application creation from ingestion alone
- browser automation
- live portal interaction
- tailoring generation logic
- cover letter generation
- full analytics/dashboarding beyond lightweight ops visibility

## Domain and schema requirements

This milestone should make the Scout-owned data model explicit.

### Required canonical records
- `scrape_runs`
- `job_source_records`
- `job_source_links`
- `jobs`
- `job_scorecards`
- `scout_decisions`
- `audit_events`

### Recommended fields / concepts

#### `scrape_runs`
Should capture at least:
- `sourceKey`
- `triggerType` (`scheduled`, `manual`, `backfill`, `test`)
- query/location payload
- status (`created`, `fetching`, `processing`, `completed`, `partial`, `failed`, `cancelled`)
- fetched / created / deduped / errored / ignored counts
- started/completed timestamps
- summarized error payload
- optional adapter/parser version

#### `job_source_records`
Should capture at least:
- source provider key
- source record id
- source URL if available
- raw payload
- normalized payload
- content hash or dedupe helper hash when useful
- capture status (`captured`, `normalized`, `deduped`, `rejected`, `errored`)
- pointer to run

#### `jobs`
Should remain the canonical downstream job entity.
Recommended additions if not already present:
- normalized title
- normalized company name through relation
- work mode
- first/last seen timestamps
- job description raw + cleaned
- job URL
- status (`discovered`, `shortlisted`, `archived`)

#### `job_scorecards`
Should capture:
- score dimensions
- overall priority score
- rationale
- top reasons
- risks
- scorer type/version when meaningful

#### `scout_decisions`
Should capture:
- job id
- optional scrape run id or other source-decision linkage
- verdict (`shortlist`, `archive`, `defer`, `needs_human_review`)
- decision source (`heuristic`, `agent`, `hybrid` as needed)
- confidence
- reason summary / reasons list
- ambiguity flags list
- policy version
- whether the decision was auto-applied
- creation timestamp

## UX requirements

### Inbox
Each job card/row should expose:
- title
- company
- location/work mode
- priority score
- Scout verdict/recommendation
- confidence band or score
- top reason(s)
- ambiguity flags when present
- risks or caveats
- provenance/source
- last seen or posted recency
- whether Scout already auto-acted or only recommended
- shortlist action
- archive action

### Shortlist
Each shortlisted job should expose:
- all core job info
- provenance summary
- score summary
- the Scout decision summary that led to shortlisting
- whether the shortlist action was automatic or human-confirmed
- whether an application already exists
- a clear next action:
  - start application, or
  - open downstream queue item

### Human review handling
Ambiguous jobs should remain visible rather than being silently dropped into archive or hidden inside raw run logs.

Recommended visibility:
- a `needs_human_review` recommendation state
- ambiguity flags
- enough reasons/context that Benny can understand why Scout hesitated

### Run visibility
Even a minimal run list is valuable.
Recommended fields:
- run time
- source key
- trigger type
- result counts
- status
- first error summary if failed or partial

## Recommended build order

1. **Implement the JobSpy MCP adapter contract (Indeed first)**
   - decide the normalized input shape
   - isolate JobSpy/Indeed parsing from core domain logic
   - keep the adapter boundary generic for later sources

2. **Add or finish Scout-owned schema pieces**
   - `scrape_runs`
   - `job_source_records`
   - `job_source_links`
   - `scout_decisions`
   - any missing status/count/decision fields

3. **Implement ingestion service with idempotent semantics**
   - create run
   - capture source records
   - normalize
   - dedupe into canonical jobs
   - write scorecards
   - finish run with counts/errors

4. **Implement the Scout decision pass**
   - select candidate jobs after ingest
   - persist verdict/confidence/reasons/ambiguity flags
   - apply conservative auto-actions when policy allows
   - preserve human-reviewable jobs when ambiguity remains

5. **Harden dedupe and decision rules with fixtures/tests**
   - rerun identical payloads
   - rerun near-duplicates
   - rerun changed listing copies
   - cover ambiguous cases and override-worthy edge cases

6. **Wire scheduled trigger path**
   - OpenClaw/Gateway cron should invoke a stable Scout service entrypoint on the host with JobSpy MCP access
   - configure the first live schedule as weekdays at `8:00 AM America/New_York`, plus Sunday `6:00 PM America/New_York` for backfill
   - manual trigger remains available
   - heartbeat remains out of scope for the first Scout implementation pass; if enabled later, it stays separate from the main ingest path

7. **Build or refine Inbox / Shortlist read models**
   - ensure UI reads through stable query helpers rather than raw ORM calls scattered across routes
   - surface Scout decision metadata, not just raw job rows

8. **Add minimal run-ops visibility**
   - at least enough to inspect recent run outcomes without shell access

9. **Add end-to-end smoke tests and fixture backfills**
   - run from empty DB
   - verify visible jobs, Scout decisions, and triage actions

## Acceptance criteria

The milestone is complete when all of the following are true:

### Scheduling / execution
- an OpenClaw/Gateway cron-backed Scout path exists and can be invoked safely on the machine with JobSpy MCP access
- the initial schedule is configured as weekdays at `8:00 AM America/New_York`, plus Sunday `6:00 PM America/New_York` for backfill
- manual Scout runs still work
- runs are recorded durably with trigger type and result counts
- heartbeat is not required for the first Scout implementation pass; if enabled later, it inspects recent run health instead of re-running Scout itself

### Provenance
- every surfaced canonical job can be traced back to one or more source records
- source records remain available as reference material
- repeated sightings refresh canonical job state without duplicating the job

### Dedupe / quality
- rerunning the same sample/source payload does not create duplicate canonical jobs
- dedupe decisions are explainable via linked source records and/or audit payloads
- malformed or partial source records do not crash the entire run silently

### Decisioning / ambiguity handling
- every new or materially changed Scout candidate receives a persisted decision
- each decision includes a verdict, confidence, reasons, and ambiguity flags when relevant
- high-confidence decisions can auto-act conservatively under policy control
- ambiguous jobs are routed to human review rather than being silently auto-archived or auto-shortlisted
- manual overrides remain auditable relative to Scout’s prior recommendation

### UI / user flow
- Inbox renders real Scout-created jobs from Postgres
- Shortlist renders real shortlisted jobs from Postgres
- shortlist and archive actions update state and emit audit events
- the UI shows enough job rationale to support triage
- the UI surfaces Scout recommendation/confidence/ambiguity data rather than only raw scorecards

### Operational sanity
- a failed run is visibly failed, not “completed” with silent drops
- run counts match reality closely enough for debugging
- at least one real JobSpy MCP -> Indeed source path can populate the system reliably

## Test plan

### Unit tests
Add/extend tests for:
- normalization helpers
- dedupe rules
- scorecard generation
- Scout decision helpers / threshold logic
- ambiguity flag generation
- status transitions for discovered/shortlisted/archived
- query/result counting helpers if extracted

### Integration tests
Use a test DB and realistic fixtures to verify:
- one run creates jobs and scorecards
- identical rerun dedupes correctly
- same job from slightly different source payload still links correctly
- partial bad records do not corrupt the rest of the run
- shortlist/archive mutations update UI-facing state and audit trail
- the JobSpy MCP -> Indeed adapter path maps upstream fields into the canonical ingestion contract correctly
- new or materially changed jobs receive Scout decisions
- ambiguous jobs persist `needs_human_review` or `defer` rather than forcing a silent auto-action
- high-confidence cases can auto-shortlist or auto-archive according to policy

### End-to-end tests
At minimum:
1. trigger Scout run
2. confirm Scout decisions are created for fresh jobs
3. confirm Inbox populated with recommendation metadata
4. shortlist one job
5. confirm Shortlist populated
6. archive one job
7. confirm it disappears from active queues

### Manual smoke checklist
- run Scout ingestion
- inspect recent audit events
- rerun the same input to confirm dedupe
- inspect recent Scout decisions for verdict/confidence/reasons/ambiguity flags
- confirm at least one high-confidence job can auto-route as intended
- confirm at least one ambiguous job remains human-reviewable
- inspect a run with at least one intentionally malformed record
- confirm recent run summary surfaces counts/errors clearly

## Best technical practices

### Keep raw and canonical layers separate
Do not let raw source payload shape leak into canonical `jobs` semantics.

### Separate deterministic ingest from Scout judgment
The fetch/normalize/dedupe layer should remain explainable and deterministic.
The Scout decision pass should consume canonical jobs and emit structured recommendations rather than blurring everything into one opaque loop.

### Make dedupe explainable
Store enough linking context that a human can understand why two source records became one job.

### Persist decisions, not just side effects
If Scout auto-shortlists or auto-archives, the recommendation and confidence should still exist as first-class persisted data.

### Prefer append-only source history
Do not overwrite raw records just because normalization improves later.

### Isolate providers
Keep JobSpy, ATS adapters, manual import, and future sources behind a stable ingestion boundary.

### Design for retries
Scheduled jobs will fail sometimes. Make reruns safe.

### Avoid route-handler business logic sprawl
Use worker/service modules for ingestion logic so cron/manual/UI can call the same core path.

### Preserve run-level telemetry
Counts, timings, and summarized errors are part of product infrastructure, not optional polish.

### Use read models for queue views
Do not couple Inbox/Shortlist UI directly to whatever raw tables are easiest in the moment.

### Be careful with timestamps
Distinguish:
- when Scout saw the job
- when the source says it was posted
- when the canonical job was created

## Common failure modes to design for

- the same provider returns duplicate records inside one run
- the same listing appears on multiple runs with tiny content changes
- different URLs point to the same logical job
- provider output is incomplete or malformed
- a scheduler accidentally triggers the same run twice
- a source partially times out and returns only some pages
- a listing disappears from the source after previously being seen
- Scout auto-acts on a gray-zone job without preserving why it made that call
- ambiguous jobs are silently buried instead of routed to human review
- manual overrides happen, but the system loses the original Scout recommendation

## Remaining open questions

1. What initial confidence thresholds should govern `shortlist`, `archive`, `defer`, and `needs_human_review` in v1?
2. Do we want a separate “ignored” or “suppressed” state later, even though `archived` means suppress forever in v1?
3. What minimum run-ops UI is enough before moving on to Milestone 2?
4. How much provider-specific telemetry from JobSpy/Indeed should be surfaced in the UI versus kept in ops/debug views only?
5. When Scout expands beyond the first narrow `Data Analyst + NYC` profile, how should multiple active search profiles and feedback policies be represented operationally?
