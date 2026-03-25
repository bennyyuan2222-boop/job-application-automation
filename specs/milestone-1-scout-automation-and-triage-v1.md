# Milestone 1 — Scout Automation and Triage Backbone v1

_Status: canonical milestone spec_
_Last updated: 2026-03-25_

## Purpose

Make the top of the funnel real.

By the end of this milestone, jobs should arrive automatically on a schedule, land in Postgres with durable provenance, dedupe cleanly, and appear in DB-backed Inbox/Shortlist views that Benny can trust.

This milestone turns Scout from a demo/manual ingest flow into a real discovery lane.

## Primary user outcome

Benny should be able to wake up, open the app, and see fresh jobs that:
- came from real runs rather than hand-entered demo data
- are not duplicated every time Scout runs
- have visible provenance and fit rationale
- can be shortlisted or archived with audit history

## Locked v1 decisions

- Scout v1 will use a JobSpy MCP-backed source adapter.
- Indeed is the first real source to prioritize.
- The human preference source is Benny's `job-search-spec.md`, but the active v1 Scout configuration starts narrowly with `Data Analyst` in `New York City`.
- OpenClaw cron on Gateway is the selected v1 scheduler runtime for Scout.
- Initial schedule: weekdays at `8:00 AM America/New_York`, plus a Sunday `6:00 PM America/New_York` backfill run.
- Heartbeat is intentionally not part of the core Scout v1 ingest/alert path yet.
- In v1, `archived` means suppress forever; repeated sightings should preserve provenance but should not automatically re-surface archived jobs.
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

### 6. Inbox and Shortlist read models
The UI should expose real DB-backed Scout outputs.

Required views:
- Inbox: discovered jobs awaiting decision
- Shortlist: kept jobs ready for downstream work

Required actions:
- shortlist
- archive
- open job details or next handoff target

### 7. Audit trail
All meaningful actions should emit audit events.

Required event categories:
- scrape run started/completed/failed
- source record captured
- job discovered
- job deduped / source record linked
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

## Out of scope

Do not build in this milestone:
- automatic shortlisting without Benny review
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

## UX requirements

### Inbox
Each job card/row should expose:
- title
- company
- location/work mode
- priority score
- top reason(s)
- risks or caveats
- provenance/source
- last seen or posted recency
- shortlist action
- archive action

### Shortlist
Each shortlisted job should expose:
- all core job info
- provenance summary
- score summary
- whether an application already exists
- a clear next action:
  - start application, or
  - open downstream queue item

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
   - any missing status/count fields

3. **Implement ingestion service with idempotent semantics**
   - create run
   - capture source records
   - normalize
   - dedupe into canonical jobs
   - write scorecards
   - finish run with counts/errors

4. **Harden dedupe rules with fixtures/tests**
   - rerun identical payloads
   - rerun near-duplicates
   - rerun changed listing copies

5. **Wire scheduled trigger path**
   - OpenClaw/Gateway cron should invoke a stable Scout service entrypoint on the host with JobSpy MCP access
   - configure the first live schedule as weekdays at `8:00 AM America/New_York`, plus Sunday `6:00 PM America/New_York` for backfill
   - manual trigger remains available
   - heartbeat remains out of scope for the first Scout implementation pass; if enabled later, it stays separate from the main ingest path

6. **Build or refine Inbox / Shortlist read models**
   - ensure UI reads through stable query helpers rather than raw ORM calls scattered across routes

7. **Add minimal run-ops visibility**
   - at least enough to inspect recent run outcomes without shell access

8. **Add end-to-end smoke tests and fixture backfills**
   - run from empty DB
   - verify visible jobs and triage actions

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

### UI / user flow
- Inbox renders real Scout-created jobs from Postgres
- Shortlist renders real shortlisted jobs from Postgres
- shortlist and archive actions update state and emit audit events
- the UI shows enough job rationale to support triage

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

### End-to-end tests
At minimum:
1. trigger Scout run
2. confirm Inbox populated
3. shortlist one job
4. confirm Shortlist populated
5. archive one job
6. confirm it disappears from active queues

### Manual smoke checklist
- run sample ingestion from UI
- inspect recent audit events
- rerun same sample to confirm dedupe
- inspect a run with at least one intentionally malformed record
- confirm recent run summary surfaces counts/errors clearly

## Best technical practices

### Keep raw and canonical layers separate
Do not let raw source payload shape leak into canonical `jobs` semantics.

### Make dedupe explainable
Store enough linking context that a human can understand why two source records became one job.

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

## Remaining open questions

1. Do we want a separate “ignored” or “suppressed” state later, even though `archived` means suppress forever in v1?
2. What minimum run-ops UI is enough before moving on to Milestone 2?
3. Should scorecard policy remain heuristic-only for now, or include lightweight JD-to-resume relevance features?
4. How much provider-specific telemetry from JobSpy/Indeed should be surfaced in the UI versus kept in ops/debug views only?
5. When Scout expands beyond the first narrow `Data Analyst + NYC` profile, how should multiple active search profiles be represented operationally?
