# Job Search Scripts

Simple, inspectable local tooling for Scout’s sourcing workflow.

## Scripts

- `jobspy-healthcheck.mjs` — checks whether mcporter daemon/server readiness exists for live sourcing
- `jobspy-client.mjs` — discovers a job-related MCP server/tool and attempts live query execution with simple payload heuristics
- `lead-utils.mjs` — normalization helpers for leads
- `dedupe-leads.mjs` — deduplicate candidate leads against existing records
- `score-leads.mjs` — first-pass scoring and keep/maybe/discard classification
- `run-sourcing-pass.mjs` — file-based sourcing runner with blocked mode, live query path, normalization, dedupe, scoring, and run logging

## Design principles

- simple over clever
- file-based and inspectable
- graceful blocked mode when live search is unavailable
- preserve clean downstream handoff

## Current state

The live query path is now wired in generically through `mcporter`, but it still depends on a real configured JobSpy-like MCP server being available. Once that exists, the next step is to validate the exact server/tool/args contract and tighten the heuristic discovery layer.
