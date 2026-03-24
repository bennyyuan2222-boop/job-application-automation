# Script and Config Migration Recommendations v1

_Status: canonical working doc_
_Last updated: 2026-03-23_

## Placement decisions

### Move toward `workers/scout/`
These contain durable sourcing-lane behavior or orchestration patterns.

- `scripts/run-sourcing-pass.mjs`
  - keep as legacy reference now
  - rebuild as queue-driven worker orchestration in `workers/scout/`
- `scripts/score-leads.mjs`
  - scoring execution belongs in the scout worker lane
- `scripts/jobspy-client.mjs`
  - move only after the ingestion contract is defined
  - likely split between a provider adapter and worker task wrapper

### Move toward `packages/`
These contain logic that should become shared, testable, and not trapped in scripts.

- `scripts/lead-utils.mjs` -> `packages/domain`
  - normalization helpers
  - lead shaping
  - common derived fields
- `scripts/dedupe-leads.mjs` -> `packages/domain`
  - dedupe rules should become canonical shared logic
  - add fixtures/tests under `tests/fixtures` and `tests/integration`
- schema ideas from `specs/lead-record-schema-v1.md` -> `packages/contracts` and `packages/domain`
- readiness/blocker ideas from `specs/latch-capability-spec-v1.md` -> `packages/readiness`
- tailoring concepts from `specs/resume-tailor-next.md` -> `packages/tailoring`

### Keep in top-level `scripts/`
These are local development or operational helpers, not core product runtime.

- a rewritten `jobspy-healthcheck` script for local adapter readiness
- seed/fixture import helpers once DB schema exists
- one-off migration inspection scripts

### Keep in `legacy/`
These should remain historical inputs and not be promoted directly.

- `config/mcporter.json`
- `mcp/README.md`
- `mcp/jobspy-mcporter-integration.md`
- `mcp/vendors/`
- markdown logs and JSONL trackers
- cover-letter material

## Specific mismatches and recommendations

### JSONL trackers
Recommendation: do not import yet.

Why:
- lead quality is mixed and first-pass scored only
- no canonical DB schema is finalized yet
- the JSONL shape reflects prototype convenience, not production invariants

Future path:
- keep as fixture/reference data
- later build an explicit importer with provenance fields and dedupe safeguards

### `config/mcporter.json`
Recommendation: do not migrate as shared config.

Why:
- local machine path dependency
- assumes OpenClaw workspace-relative vendor code
- not appropriate for hosted/shared runtime

Future path:
- if MCP remains useful, document provider adapter requirements in `infra/` or a package-specific README
- use environment-driven config rather than machine-specific absolute paths

### `mcp/vendors/jobspy-mcp-server`
Recommendation: keep as legacy/local-dev-only until consciously vendored or replaced.

Why:
- very large dependency tree
- unclear long-term ownership and upgrade path
- not yet shaped into a stable package boundary for the shared repo

Future path:
- either make a clean provider adapter package with explicit ownership
- or replace with a simpler ingestion strategy that does not depend on vendored prototype code

### Browser automation notes
Recommendation: preserve as legacy reference only.

Why:
- helpful for later automation design
- wrong layer to build first

Future path:
- revisit after `packages/db`, `packages/domain`, `apps/web`, and readiness/read-model surfaces exist
