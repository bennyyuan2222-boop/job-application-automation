# Scout Implementation Spec v1

_Status: draft_
_Last updated: 2026-03-23_

## Purpose

Define Scout’s implementation work against the **current shared repo and Phase 1 backbone**.

Scout is the sourcing and triage lane. Scout owns job ingestion, normalization, dedupe, provenance, and early ranking signals. Scout does **not** own tailoring, applications, readiness, or submit review.

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

Turn the existing platform backbone into a real **discovery + triage lane** that feeds canonical jobs into the shared DB and exposes usable Inbox/Shortlist views.

## In scope
- source ingestion flow
- `scrape_runs`
- `job_source_records`
- `job_source_links`
- canonical `jobs`
- `job_scorecards`
- job dedupe/normalization
- Inbox read model
- Shortlist read model
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
Add missing Scout-owned tables to Prisma:
- `scrape_runs`
- `job_source_records`
- `job_source_links`
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
6. expose jobs in Inbox
7. allow Benny to move jobs to `shortlisted` or `archived`

### 4. UI/API deliverables
Build:
- Inbox page backed by real DB records
- Shortlist page backed by real DB records
- actions to shortlist/archive jobs
- visible score/rationale summary
- activity events for shortlist/archive decisions

## Acceptance criteria
- Scout writes jobs into Postgres, not JSONL
- every canonical job has provenance to raw source records
- dedupe exists and is explainable
- Inbox and Shortlist pages render real jobs
- shortlist action can create the next downstream handoff cleanly
- audit trail shows sourcing and triage actions

## Handoff
Scout’s handoff is a clean canonical `job` record, ranked and optionally shortlisted, ready for Needle/application start.
