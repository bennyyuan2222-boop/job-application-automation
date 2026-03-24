# Resume Tailor Prototype Snapshot

Copied from:

`/Users/clawbot/.openclaw/workspace-resume-tailor`

Copied on: 2026-03-23

## Purpose

Preserve useful source material from the old local Needle MVP without treating that workspace as the new product root.

This folder is a **legacy snapshot**.
It is useful for:
- migration planning
- fixtures/tests
- provenance
- preserving old prototype code and artifacts

It is **not** the canonical runtime state for Job Ops Console.

Canonical runtime state belongs in:
- PostgreSQL
- object storage
- worker jobs/runtime

## What was copied

Copied with relative paths preserved:
- `IMPLEMENTATION_SPEC.md`
- `MIGRATION_APPENDIX.md`
- `data/profile/`
- `data/experience/`
- `data/raw/resumes/`
- `data/integrations/lead_registry.yaml`
- `data/jobs/assessed/`
- `data/index/metadata.db`
- `exports/pdf/`
- `integrations/lead_registry.py`
- `resumes/base/`
- `src/needle/`
- `scripts/`

## What was intentionally not copied

Not copied because these are workspace/private-agent material, transient local state, or empty/noisy:
- `AGENTS.md`, `SOUL.md`, `USER.md`, `MEMORY.md`, `IDENTITY.md`, `HEARTBEAT.md`
- `memory/`
- `.openclaw/`
- `.learnings/`
- `.git/`
- `.Trash/`
- `data/jobs/tmp_html/`
- empty `resumes/generated/`
- empty `exports/docx/`
- empty `tests/`

## Classification shorthand

- **truth-source**: real source facts about Benny or real resume source text
- **draft**: useful design/code input, but not canonical product truth
- **legacy**: historical prototype outputs/state kept only for reference
- **local-dev-only**: machine/path-specific or transient local runtime material
- **out-of-scope-v1**: not part of the first shared-product build

See the canonical migration note:

`/Users/clawbot/Documents/job-ops-console/specs/resume-tailor-migration-v1.md`
