# Implementation Next v1

_Status: canonical working doc_
_Last updated: 2026-03-23_

## Build next: `packages/db`

Priority: highest.

Build:
- initial Prisma schema scaffold
- core tables for:
  - `jobs`
  - `job_sources`
  - `job_ingestions`
  - `job_scorecards`
  - `applications`
  - `audit_events`
- generated DB client setup
- migration workflow
- seed/fixture approach for local dev

Important decisions:
- separate raw source ingestion from normalized job record
- preserve provenance from source query / ingestion run
- do not mirror prototype JSONL shape blindly

## Build next: `packages/domain`

Priority: high, immediately after DB skeleton.

Build:
- enums for lifecycle states
- state-transition rules for:
  - inbox
  - shortlist
  - tailoring
  - tailoring review
  - applying
  - submit review
  - submitted / rejected / withdrawn
- lead normalization helpers
- dedupe rule implementation
- scoring policy interface
- audit event taxonomy

Important decisions:
- make state transitions explicit and testable
- separate heuristic fit scoring from durable domain status
- define what is a job, a lead, an application, and a tailoring run

## Build next: `apps/web`

Priority: third, but start shell work in parallel once DB/domain shape is clear.

Build:
- minimal authenticated app shell
- Inbox list view
- Job detail pane
- Shortlist actions
- Activity feed wired to structured audit events
- dev-only fixture mode if backend is incomplete

Important decisions:
- optimize UI around read models, not raw tables
- keep BFF/API layer thin over domain + read-model packages
- avoid premature browser automation surfaces

## Recommended sequence

1. `packages/db`: schema + migrations + client
2. `packages/domain`: states, invariants, dedupe, scoring contracts
3. `tests/fixtures`: fixture set from legacy JSONL samples
4. `packages/read-models`: Inbox/Shortlist baseline queries
5. `apps/web`: shell + first queue views
6. `workers/scout`: first ingestion path against canonical DB

## Real open questions

- Should a sourced record first land as `job_ingestions` before normalization into `jobs`, or should ingestion be stored inline on the job record for v1 simplicity?
- What is the smallest viable application state machine that still supports shortlist, tailoring review, and submit review cleanly?
- Is JobSpy/MCP actually the intended long-term sourcing adapter, or only a temporary bootstrap path?
- What provenance fields are mandatory before any future JSONL import is allowed?
- Should resume versions be modeled in Phase 1 schema scaffolding or deferred until Scout ingestion is stable?
