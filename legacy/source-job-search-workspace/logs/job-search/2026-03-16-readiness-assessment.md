# Job Search Readiness Assessment

_Date: 2026-03-16_

## Outcome

The system is **not yet ready** for a real sourcing run.

## What I checked

- reviewed the job-search contract files
- checked the canonical lead/application trackers
- checked for MCP/JobSpy connectivity via `mcporter`
- checked whether the mcporter daemon is running

## Findings

1. `data/leads/leads.jsonl` exists but is empty.
2. `data/applications/applications.jsonl` exists but is empty.
3. `mcporter list --output json` returned zero configured servers.
4. `mcporter daemon status` reported that the daemon is not running.
5. No MCP configuration files or helper files are currently present under `mcp/`.

## Interpretation

The folder structure is ready, but the actual sourcing tool path is not configured. That means I cannot yet execute the canonical search workflow against live job sources.

## Scaffolding created today

- `specs/lead-record-schema-v1.md`
- `specs/deduplication-rules-v1.md`
- `research/query-batches-v1.md`
- `mcp/README.md`

These files define the minimum operating contract for the first live sourcing run once connectivity is fixed.

## Recommended next step

Configure and validate the JobSpy MCP server through `mcporter`, then run the first disciplined search batch.

## Remaining blockers

- no configured MCP server
- mcporter daemon not running
- no validated search tool schema or sample response yet
- no live search output yet to test normalization
