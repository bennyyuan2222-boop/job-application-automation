# Scout Implementation Spec v1

_Status: draft_
_Last updated: 2026-03-23_

## Purpose

Define Scout’s implementation work against the **current shared repo and Phase 1 backbone**.

Scout is the sourcing and triage lane. Scout owns job ingestion, normalization, dedupe, provenance, early ranking signals, and the post-ingest decision pass that decides whether a job should be shortlisted, archived, deferred, or escalated for human review. Scout does **not** own tailoring, applications, readiness, or submit review.

## Current context from Phase 1

Already implemented in the shared repo:
- neutral shared root at `/Users/clawbot/Documents/job-ops-console`
- npm workspace + Next.js app shell
- Postgres/Prisma baseline schema
- core tables already present for `companies`, `jobs`, `job_scorecards`, `resume_versions`, `applications`, `tailoring_runs`, `application_answers`, `application_attachments`, `portal_sessions`, and `audit_events`
- domain enums/state helpers
- contracts package
- minimal auth
- activity page
- seeded application detail view
- local migration + seed flow validated

This means Scout should **not** build a separate local tracker as the canonical system.

## Scout’s Phase 2 objective

Turn the existing platform backbone into a real **discovery + triage lane** that feeds canonical jobs into the shared DB, persists Scout decisions, and exposes usable Inbox/Shortlist/review flows.

## In scope
- source ingestion flow
- `scrape_runs`
- `job_source_records`
- `job_source_links`
- canonical `jobs`
- `job_scorecards`
- `scout_decisions`
- job dedupe/normalization
- Scout verdict/confidence/ambiguity handling
- Inbox read model
- Shortlist read model
- human-review routing for ambiguous jobs
- shortlist/archive actions
- audit events for sourcing + triage transitions

## Out of scope
- resume generation
- tailoring review
- application readiness
- portal sessions
- browser automation
- final submit flow

## Implementation targets

### 1. Schema follow-up
Add or harden Scout-owned tables in Prisma:
- `scrape_runs`
- `job_source_records`
- `job_source_links`
- `scout_decisions`
- optional `job_notes`

### 2. Packages / worker placement
- durable ingest/dedupe/score logic: `workers/scout/`
- shared normalization/scoring helpers: `packages/domain/` or `packages/read-models/`
- temporary import helpers only: `scripts/`

### 3. Data flow
Implement this path:
1. fetch raw source records
2. create a `scrape_run`
3. store append-only raw payloads in `job_source_records`
4. normalize/dedupe into canonical `jobs`
5. write `job_scorecards`
6. run a Scout decision pass for new or materially changed jobs
7. persist `scout_decisions` with verdict/confidence/reasons/ambiguity flags
8. auto-act conservatively where policy allows, otherwise keep jobs human-reviewable
9. expose jobs in Inbox / Shortlist / review flows

### 4. UI/API deliverables
Build:
- Inbox page backed by real DB records
- Shortlist page backed by real DB records
- visible Scout recommendation/confidence/ambiguity summary
- actions to shortlist/archive jobs
- activity events for shortlist/archive decisions
- audit visibility for Scout auto-actions or human overrides

## Acceptance criteria
- Scout writes jobs into Postgres, not JSONL
- every canonical job has provenance to raw source records
- dedupe exists and is explainable
- Scout persists a structured decision per new/materially changed candidate
- ambiguous cases remain reviewable rather than being silently auto-acted on
- Inbox and Shortlist pages render real jobs plus Scout recommendation metadata
- shortlist action can create the next downstream handoff cleanly
- audit trail shows sourcing, decisioning, and triage actions

## Handoff
Scout’s handoff is a clean canonical `job` record plus a Scout decision (verdict/confidence/reasons/ambiguity state), ready either for Needle/application start or for human review when ambiguity remains.
