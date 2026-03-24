# Shared Architecture v1

_Status: draft_
_Last updated: 2026-03-23_

## 1) Purpose

Define the neutral, shared architecture for the Job Ops Console system so that:
- no single agent workspace is treated as the product root
- the UI spec, technical spec, and Latch capability spec can operate against one shared backend
- older JSONL/file workflows can remain available as legacy reference material without becoming the long-term canonical system

## 2) Decision

The shared project root for the product is:

`/Users/clawbot/Documents/job-ops-console`

This folder is outside:
- `/Users/clawbot/.openclaw/workspace`
- `/Users/clawbot/.openclaw/workspace-job-searcher`
- `/Users/clawbot/.openclaw/workspace-resume-tailor`
- `/Users/clawbot/.openclaw/workspace-operation-agent`

That separation is intentional.

## 3) Canonical ownership model

## 3.1 Shared repo

The shared repo holds:
- specs
- app code
- worker code
- DB schema/migrations
- shared types/contracts
- tests and scripts

It is the canonical home for product code and product design docs.

## 3.2 PostgreSQL

PostgreSQL is the canonical source of truth for product state.

Examples:
- jobs
- scorecards
- applications
- resume versions
- tailoring runs
- structured answers
- attachments
- portal sessions
- audit events

## 3.3 Object storage

Object storage is the canonical home for binary/generated artifacts such as:
- rendered resume PDFs
- DOCX exports
- future browser evidence where needed
- generated application packets

## 3.4 Queue / worker runtime

The job queue is the canonical handoff layer for async work.

Examples:
- ingestion jobs
- dedupe/scoring jobs
- tailoring generation jobs
- readiness recalculation jobs
- future browser inspection jobs

## 3.5 Agent workspaces

Agent workspaces are **not** the product root.

They are for:
- identity/persona
- local notes
- learnings
- temporary scratch work
- short-lived experiments

## 4) Repo layout

```text
job-ops-console/
  README.md

  specs/
    drafts/                     # copied source drafts from OpenClaw workspaces
    shared-architecture-v1.md   # this file

  apps/
    web/                        # Next.js app / hosted console frontend + BFF layer

  packages/
    db/                         # Prisma schema, migrations, seed helpers, DB client
      prisma/
    domain/                     # enums, state machines, domain models, invariants
    contracts/                  # request/response schemas, DTOs, zod/openapi contracts
    read-models/                # Inbox/Shortlist/Tailoring/Applying/Submit Review/Activity queries
    readiness/                  # Latch readiness engine + blocker/warning taxonomy
    tailoring/                  # resume versioning, diff helpers, tailoring domain rules
    automation/                 # browser/portal inspection adapters and sync helpers
    ui/                         # shared UI components and view-model helpers

  workers/
    scout/                      # sourcing/ingestion lane
    needle/                     # resume tailoring lane
    latch/                      # application-operations lane

  infra/                        # deployment/env/bootstrap notes
  scripts/                      # local utility scripts
  tests/
    fixtures/                   # sample job/application payloads
    integration/                # cross-package/API/read-model tests

  legacy/                       # old file-based trackers and notes kept only as reference
  artifacts/
    local-dev/                  # local-only dev outputs; real artifacts belong in object storage
```

## 5) Responsibility by layer

## 5.1 Scout lane

Owns:
- ingestion into raw source records
- job normalization inputs
- source provenance
- early fit signals

Does not own:
- tailoring outputs
- application readiness state
- final submit review decisions

## 5.2 Needle lane

Owns:
- base resume selection support
- tailored resume generation
- tailoring runs
- rationale for edits
- truthfulness guardrails

Does not own:
- live portal state
- application completion state
- submit-review decision

## 5.3 Latch lane

Owns:
- structured application answers
- attachment integrity checks
- readiness calculation
- portal-session summaries
- blockers/warnings
- submit-review handoff preparation

Does not own:
- final submit click
- upstream sourcing prioritization
- original tailoring generation logic

## 5.4 Web app / BFF layer

Owns:
- authenticated user access
- stable API surfaces
- queue screens
- detail panes/workspaces
- mutation endpoints
- read models optimized for UI use

## 6) What lives where

## 6.1 Repo-only (versioned source)

Examples:
- Prisma schema
- React components
- API route handlers
- shared state-machine logic
- readiness rules implementation
- tests
- specs

## 6.2 DB-only (canonical product records)

Examples:
- `jobs`
- `job_scorecards`
- `resume_versions`
- `tailoring_runs`
- `applications`
- `application_answers`
- `application_attachments`
- `portal_sessions`
- `audit_events`

## 6.3 Object-store-only (canonical binary artifacts)

Examples:
- rendered PDFs
- DOCX files
- attachment files
- browser evidence if retained

## 6.4 Legacy/reference-only

Examples:
- prior JSONL trackers
- markdown pipeline boards
- old agent logs
- historical tailored-resume drafts stored as files

These may be useful as:
- fixtures
- design input
- migration reference
- debugging history

They should **not** become the canonical v1 backend state.

## 7) Migration mapping from current workspace material

The existing draft system under OpenClaw workspaces should be treated as source material.

## 7.1 Specs

Current draft source:
- `/Users/clawbot/.openclaw/workspace/job-search/specs/*`

New home:
- `/Users/clawbot/Documents/job-ops-console/specs/drafts/*`

Action:
- keep copies here as imported drafts
- later normalize them into a smaller canonical spec set at the root of `specs/`

## 7.2 File trackers

Current paths:
- `job-search/data/leads/leads.jsonl`
- `job-search/data/leads/search-runs.md`
- `job-search/data/applications/applications.jsonl`
- `job-search/data/applications/pipeline-board.md`
- `job-search/data/metrics/weekly-metrics.md`

New status:
- move conceptually under `legacy/`
- preserve as reference/fixtures/history
- do **not** treat as the canonical runtime datastore for the hosted system
- do **not** import them into v1 as the long-term source of truth unless a later migration plan explicitly says otherwise

## 7.3 Resumes

Current paths:
- `job-search/resumes/base/`
- `job-search/resumes/tailored/`

Future model:
- canonical records live as `resume_versions` in DB
- binary exports live in object storage
- local files can be used temporarily as seed/import material during bootstrap

## 7.4 Artifacts

Current path:
- `job-search/artifacts/`

Future model:
- object storage for canonical generated artifacts
- optional `artifacts/local-dev/` for local development outputs only

## 7.5 Logs and research

Current paths:
- `job-search/logs/`
- `job-search/research/`

Future model:
- useful reference material can be copied into `legacy/` or `specs/notes/` later
- runtime activity/history belongs in `audit_events`, not markdown log files

## 7.6 Scripts

Current path:
- `job-search/scripts/`

Future model:
- selectively migrate reusable scripts into this repo’s `scripts/`
- convert durable logic into packages/workers instead of keeping critical behavior trapped in one-off scripts

## 8) Revised phased implementation plan

## Phase 0 — Shared root bootstrap

Build:
- neutral repo scaffold outside agent workspaces
- copied draft specs
- root architecture doc
- package boundaries

Deliverable:
A shared home for the product exists outside any one agent.

## Phase 1 — Platform backbone

Build:
- Next.js app shell
- auth
- Prisma schema baseline
- DB client package
- domain enums and state machines
- audit-event plumbing

Deliverable:
The app can exist as a real hosted system with authenticated access and a shared schema foundation.

## Phase 2 — Discovery and triage backbone

Build:
- raw source ingestion path
- canonical jobs + scorecards
- Inbox read model
- Shortlist read model
- shortlist actions
- activity feed baseline

Deliverable:
Scout feeds one shared system instead of isolated files.

## Phase 3 — Tailoring backbone

Build:
- `resume_versions`
- `tailoring_runs`
- Tailoring workspace APIs
- diff-friendly resume representation
- approve/request-edits/pause flows
- transition from shortlist/start-application into `tailoring` and `tailoring_review`

Deliverable:
Needle and the Tailoring UI both operate against the same shared truth.

## Phase 4 — Latch foundation

Build:
- `applications` operational logic
- `application_answers`
- `application_attachments`
- readiness engine
- blocker/warning taxonomy
- Applying read model and detail workspace

Deliverable:
Latch can assess and operate application readiness inside the product.

## Phase 5 — Portal + submit-review backbone

Build:
- `portal_sessions`
- open-portal flow
- session summary sync
- Submit Review read model
- final checklist UX
- mark-submitted flow

Deliverable:
The final human-review boundary is explicit and productized.

## Phase 6 — Browser-assisted inspection

Build:
- Playwright-backed inspection routines
- field/validation detection
- upload-control detection
- browser-to-answer mapping scaffolding
- portal evidence summaries

Deliverable:
Browser automation augments the system after the core data model is already disciplined.

## 9) Immediate next steps

1. Decide whether to keep this root as a plain folder or initialize git here.
2. Normalize the draft specs in `specs/drafts/` into a smaller canonical spec set.
3. Create the first implementation files in:
   - `packages/db`
   - `packages/domain`
   - `apps/web`
4. Start with Phase 1 platform backbone, not browser automation.

## 10) Recommendation

Treat the old OpenClaw workspace `job-search/` folder as:
- valuable design history
- useful migration input
- acceptable scratch/prototype material

But treat `/Users/clawbot/Documents/job-ops-console` as the real shared root going forward.
