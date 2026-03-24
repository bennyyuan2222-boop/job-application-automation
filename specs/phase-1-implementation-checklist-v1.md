# Phase 1 Implementation Checklist v1

_Status: draft_
_Last updated: 2026-03-23_

## Goal

Build the **platform backbone** of the shared Job Ops Console:
- shared schema baseline
- shared domain/state model
- app shell + auth
- audit-event plumbing
- enough structure to support later Scout, Needle, and Latch work without redesign

## Not in Phase 1

Do **not** build yet:
- real browser automation
- portal form filling
- signed-in `profile="user"` flows
- final submit workflow
- full Scout ingestion pipeline
- full Needle tailoring engine migration
- full Latch readiness engine

## Checklist

### 0) Repo / workspace hygiene
- [x] Initialize git in `/Users/clawbot/Documents/job-ops-console` if not already done
- [x] Add a root package manager setup (`package.json`, workspace config)
- [x] Add basic README setup instructions
- [x] Add `.env.example` for app/db/storage placeholders
- [x] Keep all old OpenClaw workspace materials in `specs/drafts/` and `legacy/` only

### 1) `packages/db` — Prisma baseline
- [x] Initialize Prisma in `packages/db/prisma`
- [x] Create first schema with these baseline models:
  - [x] `users`
  - [x] `companies`
  - [x] `company_profiles`
  - [x] `jobs`
  - [x] `job_scorecards`
  - [x] `resume_versions`
  - [x] `applications`
  - [x] `tailoring_runs`
  - [x] `application_answers`
  - [x] `application_attachments`
  - [x] `portal_sessions`
  - [x] `audit_events`
- [x] Add enums for core statuses/types
- [x] Generate first migration
- [x] Add shared DB client export
- [x] Add seed script with a tiny fake dataset:
  - [x] 1 company
  - [x] 1 job
  - [x] 1 base resume version
  - [x] 1 application in `tailoring` or `tailoring_review`

### 2) `packages/domain` — shared state model
- [x] Define canonical enums/constants for:
  - [x] job status
  - [x] application status
  - [x] resume version kind
  - [x] actor type
  - [x] answer source type
  - [x] answer review state
  - [x] portal session mode/status
- [x] Implement job/application state transition helpers
- [x] Add invariant helpers for obvious invalid transitions
- [x] Add minimal audit-event factory helpers
- [x] Add unit tests for state transitions

### 3) `packages/contracts`
- [x] Add Zod or equivalent schemas for baseline API payloads
- [x] Define DTOs/contracts for:
  - [x] job list item
  - [x] application detail
  - [x] resume version summary
  - [x] audit event item
- [x] Keep contracts thin and implementation-friendly

### 4) `apps/web` — app shell + auth
- [x] Scaffold Next.js app in `apps/web`
- [x] Add minimal auth setup
- [x] Restrict access to Benny’s allowed email for v1
- [x] Build shared app shell with nav placeholders for:
  - [x] Inbox
  - [x] Shortlist
  - [x] Tailoring
  - [x] Applying
  - [x] Submit Review
  - [x] Activity
- [x] Add healthcheck page / route
- [x] Add a simple signed-in home page

### 5) First thin read surfaces
- [x] Build a basic Activity page from `audit_events`
- [x] Build a minimal application detail page for one seeded application
- [x] Show on that page:
  - [x] job/company header
  - [x] application status
  - [x] selected base resume
  - [x] placeholder tailored resume slot
  - [x] recent audit events
- [x] Do not build full Applying or Submit Review yet

### 6) Audit plumbing
- [x] Emit audit events for seed/demo mutations
- [x] Ensure audit rows can store actor type, label, before/after state, payload
- [x] Render audit history in the web app

### 7) Validation / exit criteria
- [x] Fresh setup can run locally from docs
- [x] Prisma migration succeeds cleanly
- [x] Seed script works
- [x] Auth gates the app
- [x] App shell loads
- [x] Seeded job/application/resume records render in UI
- [x] Audit trail is visible
- [x] No critical state is stored in local JSONL as canonical runtime truth

## Phase 1 output

By the end of Phase 1, you should have:
- a real shared repo
- a real shared DB schema baseline
- a real app shell with auth
- real canonical records for core entities
- a visible audit trail
- enough structure to begin Phase 2/3 work without redoing the foundations

## Immediate next move after Phase 1

Start a **small Latch proof slice**, not full automation:
1. one Applying-style detail view
2. one readiness summary model
3. one safe browser spike against a non-real form using managed `openclaw` profile
4. no real submit flow yet
