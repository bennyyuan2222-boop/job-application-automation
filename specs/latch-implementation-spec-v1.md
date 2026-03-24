# Latch Implementation Spec v1

_Status: draft_
_Last updated: 2026-03-23_

## Purpose

Define Latch’s implementation work against the **current shared repo and Phase 1 backbone**.

Latch is the last-mile application-operations lane. Latch owns structured answers, attachment integrity, readiness reporting, portal-session tracking, and submit-review preparation. Latch does **not** own sourcing, ranking, original tailoring logic, or the final submit click.

## Current context from Phase 1

Already implemented in the shared repo:
- canonical Prisma tables for `applications`, `application_answers`, `application_attachments`, `portal_sessions`, and `audit_events`
- application state enums and transition helpers
- seeded application detail page
- activity/audit timeline
- local app/build/migration flow validated

What does **not** exist yet:
- real readiness evaluator
- Applying queue read models
- answer/attachment edit surfaces
- portal-session sync behavior
- browser inspection/fill routines

## Latch’s Phase 2 objective

Build the **thin operational foundation** for applying-state work without jumping straight into browser automation.

## In scope
- Applying queue read model
- richer application detail workspace
- readiness summary model
- `application_answers` CRUD/support
- `application_attachments` support
- blocker/warning taxonomy
- lightweight `portal_sessions` support
- audit hooks for application operations

## Out of scope
- real external form filling
- signed-in browser automation
- final submit automation
- replacing Benny’s live portal review

## Implementation targets

### 1. Core model usage
Use these canonical records:
- `applications`
- `application_answers`
- `application_attachments`
- `resume_versions`
- `portal_sessions`
- `audit_events`

### 2. Package / worker placement
- readiness logic and blocker taxonomy: `packages/readiness/`
- portal/browser adapters later: `packages/automation/`
- application-ops worker tasks: `workers/latch/`
- UI read models: `packages/read-models/`

### 3. Data flow
Implement this path:
1. consume application with approved tailored resume
2. prepare/track structured answers
3. verify selected attachments
4. compute readiness summary
5. track blockers/warnings
6. support pause/resume and move toward `applying` / `submit_review`
7. emit audit events for each meaningful operational action

### 4. UI/API deliverables
Build:
- Applying queue page
- richer application detail workspace
- answer review/edit surfaces
- attachment manager
- readiness panel with clear blockers/warnings
- lightweight portal-session summary block

## Acceptance criteria
- Latch can explain why an application is or is not ready
- answers are field-level, not one opaque blob
- attachment selection is explicit and auditable
- readiness/blockers are visible in the UI
- no browser automation is required for the first Latch slice

## Handoff
Latch’s handoff is a disciplined `submit_review` candidate: structured, explainable, attachment-safe, and ready for Benny’s real final portal review.
