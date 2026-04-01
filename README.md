# Job Ops Console

Shared project root for Benny’s job-search operations system.

This repo is intentionally **outside any one OpenClaw agent workspace**. It is the neutral code/spec home for the hosted app, shared domain model, worker lanes, and migration away from file-based handoffs.

## Why this exists

The draft specs now point to a system with:
- a hosted web app
- PostgreSQL as the canonical source of truth
- shared read models for Inbox / Shortlist / Tailoring / Applying / Submit Review / Activity
- worker lanes for sourcing, tailoring, and application operations
- object storage for rendered artifacts
- browser-assisted inspection later, not as the foundation

That architecture should not live inside one agent’s private workspace.

## Canonical layers

### 1. Shared repo (this folder)
Holds:
- specs
- application code
- worker code
- shared domain/contracts/read-model logic
- migrations/tests/scripts

### 2. Shared runtime state
Holds the real system truth:
- PostgreSQL
- job queue
- object storage

### 3. Agent workspaces
Remain useful for:
- identity/persona
- notes
- learnings
- scratch work

They are **not** the canonical product root.

## Phase 1 local setup

1. Copy env vars:
   ```bash
   cp .env.example .env
   ```
2. Start local Postgres:
   ```bash
   docker compose -f infra/docker-compose.dev.yml up -d
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Generate and run the first migration:
   ```bash
   npm run db:migrate:dev -- --name init
   ```
5. Seed demo data:
   ```bash
   npm run db:seed:local
   ```
6. Start the web app:
   ```bash
   npm run dev:web
   ```

Then open the app and sign in with an email listed in `AUTH_ALLOWED_EMAILS`.

For Needle density QA, keep `NEEDLE_DENSITY_BASELINE_RESUME_VERSION_ID` pointed at the canonical seeded baseline (`resume-base-aebenny-canonical-v1`) unless you intentionally promote a new AEBenny master.

## Deployment-ready basics

The repo now has the minimum deployment helpers for a first hosted preview:
- Node is pinned to `22.x` via `package.json` and `.nvmrc`
- Prisma production deploy command exists: `npm run db:migrate:deploy`
- Prisma generate runs on install via `postinstall`
- Prisma schema supports Vercel/Neon env names: `DATABASE_URL` and `DATABASE_URL_UNPOOLED`
- the DB-backed app pages are marked dynamic so a hosted build does not need to pre-render live DB pages during build

For the concrete Vercel + Neon setup checklist, read:
- `specs/deployment-vercel-neon-checklist-v1.md`

## Current scaffold

Created directories:
- `apps/web`
- `packages/db`
- `packages/domain`
- `packages/contracts`
- `packages/read-models`
- `packages/readiness`
- `packages/tailoring`
- `packages/automation`
- `packages/ui`
- `workers/scout`
- `workers/needle`
- `workers/latch`
- `infra`
- `scripts`
- `tests`
- `legacy`
- `artifacts/local-dev`

Imported draft inputs:
- `specs/drafts/job-ops-console-technical-spec-v1.md`
- `specs/drafts/job-ops-console-ui-spec-v1.md`
- `specs/drafts/latch-capability-spec-v1.md`
- `specs/drafts/system-overview.md`
- `specs/drafts/lead-record-schema-v1.md`
- `specs/drafts/resume-tailor-next.md`

## Important rule

Drafts copied into `specs/drafts/` are **source material**, not the final canonical product contract yet.

Read next:
- `specs/shared-architecture-v1.md`
- `specs/phase-1-implementation-checklist-v1.md`
- `specs/deployment-vercel-neon-checklist-v1.md`
