# Needle Implementation Spec v1

_Status: draft_
_Last updated: 2026-03-23_

## Purpose

Define Needle’s implementation work against the **current shared repo and Phase 1 backbone**.

Needle is the truth-first tailoring lane. Needle owns base resume selection, tailored resume generation, tailoring runs, rationale, and truthfulness guardrails. Needle does **not** own portal state, application readiness, or final submit.

## Current context from Phase 1

Already implemented in the shared repo:
- neutral shared root at `/Users/clawbot/Documents/job-ops-console`
- Prisma baseline with `resume_versions`, `applications`, `tailoring_runs`, `audit_events`
- shared app shell + auth
- seeded base resume + seeded application
- minimal application detail view
- validated local migration/seed/build flow

Legacy Needle source material exists under:
- `legacy/source-resume-tailor-workspace/`

That legacy material contains:
- truth-source profile/experience files
- base resume variants
- local tailoring code
- migration appendix and implementation spec

## Needle’s Phase 2 objective

Turn the existing backbone into a real **tailoring subsystem** with canonical resume versions, tailoring runs, and a review-oriented Tailoring workflow.

## In scope
- migrate durable base resume concepts into shared `resume_versions`
- create Tailoring APIs/read models
- create/advance `tailoring_runs`
- choose base resume for a job/application
- generate truthful tailored drafts
- produce rationale/risk/change summaries
- audit events for tailoring lifecycle
- Tailoring Review UI support

## Out of scope
- browser automation
- portal filling
- readiness engine
- final submit review

## Implementation targets

### 1. Shared model usage
Use these canonical records:
- `jobs`
- `applications`
- `resume_versions`
- `tailoring_runs`
- `audit_events`

### 2. Package / worker placement
- tailoring logic and diff/rationale helpers: `packages/tailoring/`
- worker orchestration: `workers/needle/`
- truth/invariant helpers: `packages/domain/`

### 3. Data flow
Implement this path:
1. shortlisted job becomes an `application`
2. select best base `resume_version`
3. create a `tailoring_run`
4. generate a `resume_version(kind='tailored')`
5. attach rationale/risk/change summary
6. expose a Tailoring Review workspace
7. allow approve / request edits / pause
8. approved tailored resume becomes the application’s selected resume

### 4. UI/API deliverables
Build:
- Tailoring queue or review list
- Tailoring detail workspace for one application
- base vs tailored vs job context view
- approve/request-edits actions
- visible rationale/risk/change summary

## Acceptance criteria
- base and tailored resumes live in `resume_versions`
- tailoring executions live in `tailoring_runs`
- no tailored file sprawl is used as canonical truth
- review flow is explicit and auditable
- approved tailored resume can hand off cleanly to Applying/Latch

## Handoff
Needle’s handoff is an application with an approved tailored resume, complete tailoring lineage, and visible rationale for the next lane.
