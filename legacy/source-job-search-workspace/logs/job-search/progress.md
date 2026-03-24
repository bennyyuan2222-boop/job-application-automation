# Job Search Progress Log

## Reporting rule

Default behavior going forward:
- acknowledge Vale instructions explicitly in-server
- if told to report back "here" or "in the server," send a direct Discord message with the `message` tool to the relevant channel instead of relying only on session acknowledgments or announce events
- treat `job-search/config/mcporter.json` as the canonical MCP entrypoint for this workspace unless explicitly changed
- keep progress visible here
- post milestone-style updates after major tools/modules/scaffolds
- each milestone update includes:
  - what was built
  - where the files live
  - what is runnable now
  - what remains blocked
  - the next best step

---

## 2026-03-16 / 2026-03-17 — Initial sourcing scaffold

### What I built
- first-run lead schema spec
- deduplication rules spec
- focused query batch plan
- MCP readiness note
- readiness assessment log
- local sourcing scripts for health check, normalization, dedupe, scoring, and blocked-mode run orchestration

### Where the files live
- `specs/lead-record-schema-v1.md`
- `specs/deduplication-rules-v1.md`
- `research/query-batches-v1.md`
- `mcp/README.md`
- `logs/job-search/2026-03-16-readiness-assessment.md`
- `scripts/jobspy-healthcheck.mjs`
- `scripts/lead-utils.mjs`
- `scripts/dedupe-leads.mjs`
- `scripts/score-leads.mjs`
- `scripts/run-sourcing-pass.mjs`
- `scripts/README.md`

### What is runnable now
- `node scripts/jobspy-healthcheck.mjs`
- `node scripts/score-leads.mjs <candidates.json>`
- `node scripts/dedupe-leads.mjs <existing.jsonl> <candidates.json>`
- `node scripts/run-sourcing-pass.mjs`

### What remains blocked
- no configured JobSpy MCP server
- mcporter daemon not running
- live search query execution not yet wired into the runner
- no validated real result payload yet

### Next best step
- restore MCP connectivity, validate one small live query, then wire it into `scripts/run-sourcing-pass.mjs` for the first real sourcing pass

---

## 2026-03-16 / 2026-03-17 — Live MCP query path wired into runner

### What I built
- a simple JobSpy / mcporter client that discovers a job-related MCP server, inspects tools, selects a search-like tool heuristically, tries a small set of payload shapes, and extracts likely job record arrays from the response
- live query execution wiring inside the sourcing runner so it can attempt real MCP searches before normalization, scoring, dedupe, and logging
- integration notes documenting the current discovery assumptions and the next tightening step once a real server is available

### Where the files live
- `scripts/jobspy-client.mjs`
- `scripts/run-sourcing-pass.mjs`
- `scripts/README.md`
- `mcp/jobspy-mcporter-integration.md`

### What is runnable now
- `node scripts/jobspy-healthcheck.mjs`
- `node scripts/jobspy-client.mjs "data analyst" "New York, NY"`
- `node scripts/run-sourcing-pass.mjs`
- `node scripts/score-leads.mjs <candidates.json>`
- `node scripts/dedupe-leads.mjs <existing.jsonl> <candidates.json>`

### What remains blocked
- there is still no configured JobSpy-like MCP server in `mcporter`
- the `mcporter` daemon is still not running in the current environment
- because of that, live search does not work yet in practice
- the exact real server/tool/argument contract is still unknown and cannot be pinned until a server is available

### Next best step
- configure the real JobSpy MCP server in `mcporter`, start/validate the daemon if required, run one tiny real query through `scripts/jobspy-client.mjs`, then tighten the runner from heuristic discovery to the exact live schema

---

## 2026-03-17 — JobSpy MCP live in workspace

### What I verified
- vendored JobSpy MCP server is present under `mcp/vendors/jobspy-mcp-server`
- local workspace mcporter config exists at `config/mcporter.json` and exposes a stdio server named `jobspy`
- `node scripts/jobspy-healthcheck.mjs` now succeeds from the job-search workspace
- `mcporter list jobspy --schema --json` works and shows the real `search_jobs` tool schema
- `node scripts/jobspy-client.mjs "data analyst" "New York, NY"` returns live records
- `node scripts/run-sourcing-pass.mjs` now runs end-to-end with `live_search: true`

### What changed/fixed
- the upstream MCP server was patched to start without the broken prompt registration path
- the runner was patched to map the real JobSpy camelCase fields so live records normalize correctly
- `job-search/config/mcporter.json` is now the canonical MCP entrypoint for this workspace

### Where the relevant files live
- `config/mcporter.json`
- `mcp/vendors/jobspy-mcp-server/`
- `mcp/vendors/jobspy-mcp-server/src/index.js`
- `scripts/jobspy-healthcheck.mjs`
- `scripts/jobspy-client.mjs`
- `scripts/run-sourcing-pass.mjs`
- latest verified run log: `logs/job-search/2026-03-17-2026-03-17-run-2518.md`

### What is runnable now
- `node scripts/jobspy-healthcheck.mjs`
- `mcporter list jobspy --schema --json`
- `node scripts/jobspy-client.mjs "data analyst" "New York, NY"`
- `node scripts/run-sourcing-pass.mjs`

### What is live-working now
- live JobSpy search is working through the local workspace `mcporter` config
- the runner can execute live searches, normalize results, score them, dedupe them, and write run logs

### Current verified run result
- verified run: `2026-03-17-run-2518`
- keeps: 0
- maybes: 20
- discards: 0
- duplicates: 76
- `live_search: true`

### Remaining caveats
- `mcporter` daemon still reports not running, but this setup works via the configured stdio server and does not require the daemon for successful local runs
- the exact JobSpy tool contract is now partially known (`jobspy.search_jobs`), but the runner should still be tightened further from heuristic payload selection to the exact schema
- scoring thresholds likely need tuning because live search is working but the current batch verified to 0 keeps / 20 maybes on rerun

### Next best step
- pin the runner to the exact `jobspy.search_jobs` argument shape from the real schema, then tune scoring/rejection heuristics using the first live results so the keep/maybe split becomes more useful
