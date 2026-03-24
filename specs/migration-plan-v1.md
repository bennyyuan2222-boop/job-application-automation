# Migration Plan v1

_Status: canonical working doc_
_Last updated: 2026-03-23_

## Goal

Migrate useful material from the old OpenClaw workspace prototype at:

`/Users/clawbot/.openclaw/workspace/job-search`

into the shared product root at:

`/Users/clawbot/Documents/job-ops-console`

without treating the old workspace as canonical product state.

## Operating rules

- Copy first; do not destroy old history.
- Preserve provenance. Old prototype material must stay visibly marked as legacy or draft.
- Shared repo = code/specs.
- PostgreSQL = canonical runtime state.
- Object storage = canonical artifact state.
- Queue/workers = async handoff.
- Agent workspaces = private notes/scratch, not product roots.

## What was copied

Copied the old workspace into:

`legacy/source-job-search-workspace/`

This is a reference snapshot of the prototype structure, including scripts, data files, logs, MCP notes, and vendor code.

## Classification summary

### Canonical-now
- `specs/shared-architecture-v1.md`
- `specs/migration-plan-v1.md`
- `specs/source-to-target-mapping-v1.md`
- `specs/migration-recommendations-v1.md`
- `specs/implementation-next-v1.md`

### Draft
- imported prototype specs under `specs/drafts/`
- old top-level prototype docs copied into `specs/drafts/`

### Legacy-reference
- `legacy/source-job-search-workspace/data/`
- `legacy/source-job-search-workspace/logs/`
- `legacy/source-job-search-workspace/research/`
- `legacy/source-job-search-workspace/agents/`
- `legacy/source-job-search-workspace/mcp/README.md`
- `legacy/source-job-search-workspace/mcp/jobspy-mcporter-integration.md`

### Local-dev-only
- `legacy/source-job-search-workspace/config/mcporter.json`
- `legacy/source-job-search-workspace/mcp/vendors/`
- any future local output under `artifacts/local-dev/`

### Out-of-scope-v1
- `legacy/source-job-search-workspace/cover-letters/`
- browser-heavy automation as a foundational system dependency

### Discardable-noise
- `.DS_Store`
- empty prototype folders that carried no source material value

## Migration phases

### Phase 1 — preserve and label
- copy old workspace into `legacy/source-job-search-workspace/`
- copy old specs into `specs/drafts/`
- keep provenance explicit

### Phase 2 — normalize architecture
- collapse prototype ideas into a small canonical spec layer
- document source-to-target mapping
- decide package and worker boundaries

### Phase 3 — implement backbone
- start with `packages/db`
- then `packages/domain`
- then `apps/web`
- keep legacy JSONL and markdown logs as reference only

## Non-goal for this migration

Do not import old JSONL into Postgres yet.

Reason:
- the old lead tracker already contains noisy first-pass source output
- the target schema and state model are still being normalized
- importing now would prematurely freeze prototype assumptions into the canonical backend

A later import can be justified only after:
- DB schema exists
- dedupe and provenance rules are explicit
- import quality thresholds are defined
