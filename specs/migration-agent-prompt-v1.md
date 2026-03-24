# Migration Agent Prompt v1

Use this prompt with a coding/implementation agent.

---

You are migrating a **file-based prototype job-search workspace** into a new **neutral shared project root** for the hosted Job Ops Console system.

## Objective

Migrate the useful product/code/spec material from the old workspace into the new shared repo structure **without treating the old agent workspace as canonical** and **without losing historical reference material**.

Your goal is to leave the new shared root better organized, clearly documented, and ready for real implementation work.

## Source root (old prototype workspace)

`/Users/clawbot/.openclaw/workspace/job-search`

## Target root (new shared project root)

`/Users/clawbot/Documents/job-ops-console`

## Important architectural context

The old workspace was built as a file-based, agent-oriented prototype.
The new system direction is different:
- shared repo outside any one agent workspace
- hosted web app
- PostgreSQL as canonical source of truth
- shared read models for UI queues
- workers for sourcing, tailoring, and application operations
- object storage for generated artifacts
- browser-assisted inspection later, not first

Read these first in the target root:
1. `README.md`
2. `specs/shared-architecture-v1.md`
3. everything in `specs/drafts/`

## What exists in the old workspace now

Top-level folders/files include:
- `README.md`
- `SCOUT_CONTEXT.md`
- `agents/`
- `artifacts/`
- `config/`
- `cover-letters/`
- `data/`
- `job-search-spec.md`
- `job-search-subagent-summary.md`
- `logs/`
- `mcp/`
- `research/`
- `resumes/`
- `scripts/`
- `specs/`

Key observations from the old workspace:
- The old README says canonical records live in `data/`.
- Scout docs and scripts are explicitly file-based and depend on:
  - `data/leads/leads.jsonl`
  - `data/leads/search-runs.md`
  - `config/mcporter.json`
  - `scripts/*.mjs`
- `applications.jsonl` appears empty right now.
- `pipeline-board.md` uses an older stage model than the newer job-ops console specs.
- There are useful research notes for browser automation and MCP readiness.
- Cover letters are currently present in the old workspace, but cover letters are out of scope for v1 in the newer technical spec.

## Your mission

Perform a **copy-first migration and reclassification pass** from the old workspace into the new shared root.

That means:
- do **not** treat the old workspace as canonical
- do **not** delete the old workspace
- do **not** silently discard useful historical material
- do **not** import old JSONL files into a new DB schema yet
- do **not** overbuild implementation code if the migration/docs layer is still unclear

## Primary tasks

### 1) Inventory and classify the old workspace
Create a migration inventory that classifies each meaningful top-level file/folder from the source root into one of these buckets:
- `shared-canonical-now`
- `shared-but-draft`
- `legacy-reference`
- `local-dev-only`
- `out-of-scope-v1`
- `discardable-noise`

At minimum, classify:
- `README.md`
- `SCOUT_CONTEXT.md`
- `agents/`
- `artifacts/`
- `config/`
- `cover-letters/`
- `data/`
- `job-search-spec.md`
- `job-search-subagent-summary.md`
- `logs/`
- `mcp/`
- `research/`
- `resumes/`
- `scripts/`
- `specs/`

### 2) Preserve old material under `legacy/`
Create a clear legacy subtree in the target root for source-workspace reference material.

Suggested shape:
```text
legacy/
  source-job-search-workspace/
    README.md
    SCOUT_CONTEXT.md
    data/
    logs/
    research/
    resumes/
    artifacts/
    cover-letters/
    ...
```

Use copy, not move.

If some old content is obviously too noisy or bulky to copy wholesale, preserve at least:
- a manifest
- representative samples
- exact path references
- a note explaining what was intentionally left behind and why

### 3) Normalize product docs in the new repo
The current `specs/drafts/` folder contains copied drafts.

Create a first-pass canonical docs layer in `specs/` by deciding which docs should become active shared docs now.

At minimum, produce or update:
- `specs/migration-plan-v1.md`
- `specs/source-workspace-mapping-v1.md`
- `specs/scout-lane-v1.md` (if helpful from existing Scout docs)
- optional `specs/legacy-data-policy-v1.md`

Important:
- keep the original drafts untouched in `specs/drafts/`
- reference them explicitly from the new docs
- do not pretend every old doc is still canonical

### 4) Migrate reusable scripts and configs thoughtfully
Audit the old file-based scripts under `job-search/scripts/`.

For each script, decide whether it should become:
- a temporary helper under `scripts/`
- future worker logic under `workers/scout/`
- shared domain logic under `packages/`
- legacy-only reference

Specifically inspect:
- `jobspy-healthcheck.mjs`
- `jobspy-client.mjs`
- `lead-utils.mjs`
- `dedupe-leads.mjs`
- `score-leads.mjs`
- `run-sourcing-pass.mjs`

Also inspect:
- `config/mcporter.json`
- `mcp/README.md`
- vendor/server references under `mcp/vendors/`

Produce a written recommendation for where each piece belongs in the new architecture.

### 5) Reconcile old file-based assumptions with the new architecture
Document the mismatches between:
- the old file-based workflow
- the newer shared architecture / technical / UI / Latch specs

At minimum, call out mismatches around:
- canonical data location (`data/*.jsonl` vs Postgres)
- workflow states
- artifact handling
- runtime activity/audit storage
- browser automation placement
- worker boundaries
- cover-letter scope

### 6) Create a concrete next-step implementation map
After the migration docs are in place, create a short implementation-ready map that says:
- what to build next in `packages/db`
- what to build next in `packages/domain`
- what to build next in `apps/web`
- what to postpone
- what remains legacy-only

This should be short, sharp, and actionable.

## Constraints

- Prefer **copy-first** over move/delete.
- Do not destroy or rewrite the old workspace in place.
- Do not claim the old workspace is still canonical.
- Do not invent data migrations into SQL unless you also document why that is safe.
- Treat cover letters as out of scope for v1 unless you are explicitly preserving them as legacy/reference.
- Keep browser automation in the “later/shared automation layer” bucket, not as the system foundation.
- Preserve clear provenance: readers should always be able to tell what came from the old workspace vs what is newly canonical.

## Deliverables

By the end, I expect:

1. A migration inventory/classification doc
2. A source-to-target mapping doc
3. A preserved `legacy/source-job-search-workspace/` subtree or equivalent manifest-backed preservation
4. A recommendation doc for scripts/config migration
5. A short implementation-next doc for the new shared repo
6. A concise summary of what you changed and what still needs a human decision

## Output format

Reply with:

### A. What you migrated / copied
- exact files/folders

### B. What you classified as legacy vs canonical
- with rationale

### C. What you recommend building next
- 3-7 bullets max

### D. Open questions / decisions for Benny
- only real ones, not filler

## Tone / operating style

Be disciplined, practical, and non-magical.
Do not produce a vague essay.
Make the migration legible.

---

If you need a default interpretation rule:
- old workspace = prototype source material
- new shared root = real product home
- DB/object storage/queue = canonical runtime system
- agent workspaces = private homes, not system roots
