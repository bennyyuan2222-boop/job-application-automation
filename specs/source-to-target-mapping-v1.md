# Source-to-Target Mapping v1

_Status: canonical working doc_
_Last updated: 2026-03-23_

## Top-level inventory classification

### canonical-now
- `README.md` in new repo
- `specs/shared-architecture-v1.md`
- canonical migration docs in `specs/`

### draft
- old `specs/` files copied into `specs/drafts/`
- `job-search-spec.md` -> `specs/drafts/job-search-spec-prototype-v1.md`
- `job-search-subagent-summary.md` -> `specs/drafts/job-search-subagent-summary-prototype.md`
- `README.md` from old workspace -> `specs/drafts/job-search-workspace-readme-prototype.md`
- `SCOUT_CONTEXT.md` -> `specs/drafts/scout-context-prototype.md`

### legacy-reference
- `agents/`
- `data/`
- `logs/`
- `research/`
- `mcp/README.md`
- `mcp/jobspy-mcporter-integration.md`

### local-dev-only
- `config/mcporter.json`
- `mcp/vendors/`

### out-of-scope-v1
- `cover-letters/`
- empty prototype artifact folders intended for file-based output

### discardable-noise
- `.DS_Store`

## Source to target map

| Old source | Classification | New target | Notes |
|---|---|---|---|
| `README.md` | draft | `specs/drafts/job-search-workspace-readme-prototype.md` | useful prototype orientation, not canonical architecture |
| `SCOUT_CONTEXT.md` | draft | `specs/drafts/scout-context-prototype.md` | persona/operating assumptions for sourcing lane |
| `job-search-spec.md` | draft | `specs/drafts/job-search-spec-prototype-v1.md` | source preference and targeting input |
| `job-search-subagent-summary.md` | draft | `specs/drafts/job-search-subagent-summary-prototype.md` | historical summary, not contract |
| `agents/job-search-agent.md` | legacy-reference | `legacy/source-job-search-workspace/agents/job-search-agent.md` | keep as legacy agent prompt input |
| `specs/*.md` | draft | `specs/drafts/` | source material for canonical docs |
| `data/leads/leads.jsonl` | legacy-reference | `legacy/source-job-search-workspace/data/leads/leads.jsonl` | do not import to DB yet |
| `data/leads/search-runs.md` | legacy-reference | `legacy/source-job-search-workspace/data/leads/search-runs.md` | historical sourcing runs |
| `data/applications/applications.jsonl` | legacy-reference | `legacy/source-job-search-workspace/data/applications/applications.jsonl` | empty in prototype snapshot |
| `data/applications/pipeline-board.md` | legacy-reference | `legacy/source-job-search-workspace/data/applications/pipeline-board.md` | concept reference only |
| `data/metrics/weekly-metrics.md` | legacy-reference | `legacy/source-job-search-workspace/data/metrics/weekly-metrics.md` | useful for future KPI design |
| `scripts/lead-utils.mjs` | migration candidate | `packages/domain` then optional `workers/scout` wrapper | normalization and record-shaping logic belongs in shared code |
| `scripts/dedupe-leads.mjs` | migration candidate | `packages/domain` or `packages/contracts` tests | dedupe rules should become canonical shared logic |
| `scripts/score-leads.mjs` | migration candidate | `workers/scout` + `packages/domain` | scoring policy + worker orchestration |
| `scripts/run-sourcing-pass.mjs` | migration candidate | `workers/scout` | orchestration pattern, but file writes must be removed |
| `scripts/jobspy-client.mjs` | migration candidate | `workers/scout` or `packages/automation` | depends on whether source ingestion is generic or JobSpy-specific |
| `scripts/jobspy-healthcheck.mjs` | migration candidate | `scripts/` or `workers/scout/dev` | local readiness check, not core product logic |
| `scripts/README.md` | legacy-reference | `legacy/source-job-search-workspace/scripts/README.md` | design notes only |
| `config/mcporter.json` | local-dev-only | `legacy/source-job-search-workspace/config/mcporter.json` | machine-specific; do not treat as shared runtime config |
| `mcp/vendors/` | local-dev-only | `legacy/source-job-search-workspace/mcp/vendors/` | huge vendor tree; avoid promoting into canonical package layout without review |
| `research/query-batches-v1.md` | legacy-reference | `legacy/source-job-search-workspace/research/query-batches-v1.md` | useful query fixture/source strategy |
| `research/openclaw-browser-automation-notes-2026-03-18.md` | out-of-scope-v1 | `legacy/source-job-search-workspace/research/openclaw-browser-automation-notes-2026-03-18.md` | later automation input, not v1 foundation |
| `logs/job-search/*.md` | legacy-reference | `legacy/source-job-search-workspace/logs/job-search/` | historical run notes; map conceptually to audit events later |
| `resumes/` | legacy-reference | `legacy/source-job-search-workspace/resumes/` | empty in snapshot |
| `cover-letters/` | out-of-scope-v1 | `legacy/source-job-search-workspace/cover-letters/` | explicitly not part of v1 build |
| `artifacts/` | legacy-reference | `legacy/source-job-search-workspace/artifacts/` | empty in snapshot; keep only as structure reference |

## Architecture mismatches to preserve explicitly

### `data/*.jsonl` vs Postgres
Old prototype uses append-only JSONL files for leads and applications.
New architecture requires normalized DB tables with durable IDs, provenance, read models, and worker-safe mutation rules.

### old stages vs new state model
Old pipeline concepts were lightweight markdown/file stages.
New architecture needs explicit domain states and transitions for sourcing, shortlist, tailoring, applying, submit review, and submitted outcomes.

### markdown logs vs audit events
Old run summaries and progress notes live in markdown.
New system should capture runtime activity as structured `audit_events` and worker/job telemetry.

### file artifacts vs object storage
Old system assumed local folders for packets/resumes/artifacts.
New system should store canonical binaries in object storage, with local folders only for development output.

### browser research vs later automation layer
Old notes discuss browser automation early.
New architecture defers browser-assisted inspection until after the DB/domain/read-model backbone exists.

### cover letters vs v1 scope
Cover letters existed as prototype folders.
They are out of scope for v1 and should not shape the first DB/domain/app build.
