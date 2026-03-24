# Resume Tailor Migration v1

_Status: canonical working doc_
_Last updated: 2026-03-23_

## Goal

Migrate useful material from the old local Needle MVP at:

`/Users/clawbot/.openclaw/workspace-resume-tailor`

into the shared product root at:

`/Users/clawbot/Documents/job-ops-console`

without treating the old workspace as canonical product state.

## Operating rules

- Copy first; do not delete or rewrite the old workspace.
- Preserve provenance. Old prototype material must stay visibly labeled as old prototype material.
- Shared repo = code/specs.
- PostgreSQL = canonical runtime state.
- Object storage = canonical artifact state.
- Workers = async execution/runtime.
- Agent workspaces = private notes/scratch, not product roots.
- Preserve Needle’s truth-first rules: no fake claims, no invented metrics/tools, no file sprawl by default.

## What was copied

Copied into:

`legacy/source-resume-tailor-workspace/`

### Copied files/directories
- `IMPLEMENTATION_SPEC.md`
- `MIGRATION_APPENDIX.md`
- `data/profile/*`
- `data/experience/*`
- `data/raw/resumes/*`
- `data/integrations/lead_registry.yaml`
- `data/jobs/assessed/*`
- `data/index/metadata.db`
- `exports/pdf/*`
- `integrations/lead_registry.py`
- `resumes/base/*`
- `src/needle/*`
- `scripts/*`

### Intentionally not copied
- workspace/private-agent files: `AGENTS.md`, `SOUL.md`, `USER.md`, `MEMORY.md`, `IDENTITY.md`, `HEARTBEAT.md`
- workspace memory and learnings: `memory/`, `.learnings/`, `.openclaw/`
- VCS/housekeeping: `.git/`, `.Trash/`
- transient render intermediates: `data/jobs/tmp_html/`
- empty folders: `resumes/generated/`, `exports/docx/`, `tests/`

## Inventory classification

### canonical-now
From the old workspace itself: **nothing**.

Reason:
- the old resume-tailor workspace was a local MVP inside an agent workspace
- the shared repo, Postgres, object storage, and workers are now the canonical architecture

Current canonical product docs/state holders in the shared repo are:
- `README.md`
- `specs/shared-architecture-v1.md`
- `specs/migration-plan-v1.md`
- `specs/source-to-target-mapping-v1.md`
- `specs/migration-recommendations-v1.md`
- `specs/implementation-next-v1.md`
- `specs/resume-tailor-migration-v1.md`

### truth-source
These contain real source facts or real resume source text and should drive later import/seed work, not live file reads at runtime.

- `legacy/source-resume-tailor-workspace/data/profile/basics.json`
- `legacy/source-resume-tailor-workspace/data/profile/master_profile.yaml`
- `legacy/source-resume-tailor-workspace/data/profile/skills.json`
- `legacy/source-resume-tailor-workspace/data/profile/skills.yaml`
- `legacy/source-resume-tailor-workspace/data/profile/resume_inventory.json`
- `legacy/source-resume-tailor-workspace/data/profile/resume_density_baseline.json`
- `legacy/source-resume-tailor-workspace/data/experience/roles.json`
- `legacy/source-resume-tailor-workspace/data/experience/roles.yaml`
- `legacy/source-resume-tailor-workspace/data/experience/projects.json`
- `legacy/source-resume-tailor-workspace/data/experience/projects.yaml`
- `legacy/source-resume-tailor-workspace/data/experience/achievements.json`
- `legacy/source-resume-tailor-workspace/data/experience/achievements.yaml`
- `legacy/source-resume-tailor-workspace/data/raw/resumes/resume_variant_1.md`
- `legacy/source-resume-tailor-workspace/data/raw/resumes/resume_variant_2.md`
- `legacy/source-resume-tailor-workspace/data/raw/resumes/resume_variant_3.md`

Notes:
- The JSON/YAML pairs are duplicate representations of the same underlying facts.
- They are valuable source material, but the shared product should choose one import-authoring path before any DB seeding.

### draft
These are useful design/code inputs, but should not be promoted directly into canonical runtime behavior without refactoring.

- `legacy/source-resume-tailor-workspace/IMPLEMENTATION_SPEC.md`
- `legacy/source-resume-tailor-workspace/MIGRATION_APPENDIX.md`
- `legacy/source-resume-tailor-workspace/data/profile/base_resume_manifests.json`
- `legacy/source-resume-tailor-workspace/resumes/base/README.md`
- `legacy/source-resume-tailor-workspace/resumes/base/analytics.md`
- `legacy/source-resume-tailor-workspace/resumes/base/business_analyst.md`
- `legacy/source-resume-tailor-workspace/resumes/base/product_strategy.md`
- `legacy/source-resume-tailor-workspace/src/needle/assess.py`
- `legacy/source-resume-tailor-workspace/src/needle/jd_keywords.py`
- `legacy/source-resume-tailor-workspace/src/needle/manifests.py`
- `legacy/source-resume-tailor-workspace/src/needle/models.py`
- `legacy/source-resume-tailor-workspace/src/needle/policy.py`
- `legacy/source-resume-tailor-workspace/src/needle/profile.py`
- `legacy/source-resume-tailor-workspace/src/needle/tailor.py`
- `legacy/source-resume-tailor-workspace/src/needle/variants.py`

Notes:
- This is where the best prototype logic lives.
- The concepts are worth preserving; the exact file-based Python implementation is not the new product contract.

### legacy
These preserve historical prototype behavior or outputs and are useful for reference, fixtures, and comparison only.

- `legacy/source-resume-tailor-workspace/data/jobs/assessed/*`
- `legacy/source-resume-tailor-workspace/data/index/metadata.db`
- `legacy/source-resume-tailor-workspace/exports/pdf/*`
- `legacy/source-resume-tailor-workspace/src/needle/cli.py`
- `legacy/source-resume-tailor-workspace/src/needle/config.py`
- `legacy/source-resume-tailor-workspace/src/needle/export.py`
- `legacy/source-resume-tailor-workspace/src/needle/simpleio.py`
- `legacy/source-resume-tailor-workspace/src/needle/store.py`
- `legacy/source-resume-tailor-workspace/src/needle/__init__.py`
- `legacy/source-resume-tailor-workspace/integrations/lead_registry.py`

Notes:
- These encode the local MVP runtime shape: local CLI, local file IO, local SQLite, local exports, local adapter assumptions.
- They are not suitable as the shared runtime layer.

### local-dev-only
These are path-specific, machine-local, or transient helper pieces.

- `legacy/source-resume-tailor-workspace/data/integrations/lead_registry.yaml`
- `legacy/source-resume-tailor-workspace/scripts/render_pdf.js`
- `legacy/source-resume-tailor-workspace/scripts/test_pdf_export.js`
- not copied: `data/jobs/tmp_html/*`

Notes:
- `lead_registry.yaml` hardcodes a path into another OpenClaw workspace.
- The PDF scripts assume local Playwright/browser setup and local output folders.

### out-of-scope-v1
These should not shape the first shared-product build.

- workspace persona/memory files from the old agent workspace
- empty `resumes/generated/approved/` and `resumes/generated/tmp/` file-sprawl conventions
- empty `exports/docx/`
- empty `tests/` scaffold from the MVP

## Recommended placement in the shared repo

## `packages/tailoring`
Belongs here after rewrite/refactor:

- fit assessment logic from `src/needle/assess.py`
- truthful tailoring logic from `src/needle/tailor.py`
- truth-risk/forbidden-claim rules from `src/needle/policy.py`
- JD keyword/support extraction logic from `src/needle/jd_keywords.py`
- base-resume selection and manifest concepts from `src/needle/manifests.py`, `src/needle/variants.py`, and `data/profile/base_resume_manifests.json`
- density/silhouette rules from `data/profile/resume_density_baseline.json`
- output contracts for:
  - fit assessment
  - change summary
  - unsupported requirements
  - source traceability
  - resume lineage

Recommendation:
- treat the old Python as logic reference, not as code to vendor directly
- rebuild around `resume_versions`, `tailoring_runs`, and typed contracts

## `packages/domain`
Belongs here as shared invariants/types, not worker-local logic:

- evidence-strength taxonomy (`verified`, `supported`, etc.)
- role/project/achievement/profile model semantics from `data/profile/*` and `data/experience/*`
- fit band / recommended action enums (`use_base`, `light_tailor`, `full_tailor`, `caution`)
- risk taxonomy and unsupported-requirement semantics
- base resume lane definitions (`analytics`, `business_analyst`, `product_strategy`, etc.)
- stable traceability concepts linking bullets back to source achievements

Recommendation:
- choose one authoring/import path for profile + experience source material
- keep domain rules storage-agnostic

## `packages/db`
Belongs here as schema/import/DB-boundary work:

- Prisma models for:
  - `jobs`
  - `job_sources` / source provenance
  - `applications`
  - `resume_versions`
  - `tailoring_runs`
  - `audit_events`
  - optional external-source link fields for legacy `lead_uid`
- seed/import helpers that ingest truth-source material from the legacy snapshot
- migration scripts that turn legacy source facts into DB fixtures/seed records
- a deliberate replacement for `metadata.db`, not a direct import of that SQLite file as canonical runtime truth

Recommendation:
- do not mirror `assessment_runs` 1:1 just because it existed in SQLite
- design the DB around the shared product model first, then import only what maps cleanly

## `workers/needle`
Belongs here as async orchestration/runtime:

- fetch canonical job/application context from Postgres
- resolve base resume version
- call `packages/tailoring` for fit + tailoring generation
- persist `tailoring_runs` and `resume_versions`
- emit `audit_events`
- optionally render/export artifacts via object storage after explicit review/approval rules

Recommendation:
- any transitional lead-registry adapter should live behind a temporary worker/service boundary, not as the core long-term read path
- do not make the worker depend on local workspace files at runtime

## `scripts`
Keep here only for local dev, migration, or inspection helpers:

- one-off import/seed scripts for old truth-source files
- fixture generation from legacy assessed outputs
- local artifact/render smoke tests
- repo maintenance scripts

Recommendation:
- `render_pdf.js` is not core product logic; keep only if needed as a dev helper or replace later with a shared artifact service/path

## `legacy`
Keep here as preserved reference only:

- the entire copied `source-resume-tailor-workspace/` snapshot
- local SQLite (`metadata.db`)
- generated assessment JSON/markdown
- historical PDFs
- machine/path-specific config
- placeholder base resume markdown files
- old Python CLI/runtime wrappers

## Key architecture mismatches to preserve explicitly

### 1. Local YAML/JSON truth files vs shared model
Old MVP:
- editable YAML/JSON files under `data/profile/` and `data/experience/`

New architecture:
- Postgres-backed canonical runtime state with explicit domain models and import/seed boundaries

Migration rule:
- treat the files as source material for import/seed/reference
- do not keep live production reads pointed at legacy workspace files

### 2. `metadata.db` vs Postgres
Old MVP:
- local SQLite with an `assessment_runs` table only

New architecture:
- Postgres with first-class `jobs`, `applications`, `resume_versions`, `tailoring_runs`, and `audit_events`

Migration rule:
- do not import SQLite rows as canonical truth by default
- keep them only as reference fixtures unless a later mapping is explicitly justified

### 3. Lead-registry SQLite adapter vs shared jobs/applications
Old MVP:
- `integrations/lead_registry.py` + `data/integrations/lead_registry.yaml`
- direct reads from a separate OpenClaw workspace SQLite database

New architecture:
- shared DB-backed jobs/applications model and worker-safe handoff

Migration rule:
- preserve adapter behavior only as transitional reference
- long-term runtime should read jobs/applications from the shared system, not another workspace DB file

### 4. Markdown/base resume files vs `resume_versions`
Old MVP:
- placeholder markdown base resumes plus a JSON manifest
- tailored drafts saved as markdown/JSON files

New architecture:
- base and tailored resumes modeled as `resume_versions` with lineage, structured sections, and traceability

Migration rule:
- carry over the base-resume concept and lane strategy
- do not treat markdown files as the lasting storage contract

### 5. Local generated files/PDF exports vs object storage
Old MVP:
- local `data/jobs/assessed/*`, local HTML temp files, local `exports/pdf/*`

New architecture:
- generated artifacts stored in object storage, with DB records pointing to them

Migration rule:
- keep old files as legacy examples only
- do not normalize file-sprawl as the default behavior in v1

## Build next

Short plan:

1. **Add Needle-ready schema scaffolding in `packages/db`.**
   - include `resume_versions`, `tailoring_runs`, and `audit_events` alongside the existing jobs/applications backbone
   - include provenance fields for any future external `lead_uid` link

2. **Define shared tailoring/domain contracts.**
   - evidence strength
   - fit band / recommended action
   - unsupported requirement shape
   - source-traceable resume section/bullet shape
   - base-vs-tailored lineage

3. **Choose one import-authoring path for the old truth files.**
   - decide JSON vs YAML as the preserved authoring/reference format
   - write seed/import helpers from `legacy/source-resume-tailor-workspace/data/{profile,experience,raw/resumes}`

4. **Rebuild the core Needle logic inside `packages/tailoring`.**
   - use the old Python logic only as reference
   - add tests using the legacy assessed outputs as fixtures, not as truth

5. **Build `workers/needle` around the shared runtime model.**
   - load job/application context from Postgres
   - persist `tailoring_runs` / `resume_versions`
   - write export artifacts to object storage only when warranted

## Real open questions only

- Which format should remain the human-maintained source reference during transition: YAML, JSON, or DB-first with exported snapshots?
- Should `resume_versions` land in the first DB schema pass, or immediately after the jobs/applications backbone is stable?
- Should legacy `lead_uid` remain a first-class external reference on `jobs`/`applications`, or only survive in migration metadata?
- Are the historical assessed outputs worth importing as fixtures/tests only, or is there any justified reason to preserve them as product-visible history?
- Should artifact rendering stay in the Needle worker lane, or be split into a more generic artifact-generation path once object storage exists?
