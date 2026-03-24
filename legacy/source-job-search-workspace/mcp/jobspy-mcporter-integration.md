# JobSpy / mcporter integration notes

This file documents how the live sourcing runner is expected to work once a JobSpy-like MCP server is configured.

## Discovery flow

1. `mcporter list --output json`
2. pick a configured server whose name looks job-related (`jobspy`, `job`, `jobs`)
3. `mcporter list <server> --schema --json`
4. pick the best search-like tool on that server
5. call that tool with a small JSON payload

## Current tool assumptions

Because the real server is not configured yet, the runner uses heuristics:
- server-name match: `jobspy|job|jobs`
- tool-name match: `search jobs`, `job search`, `search`, `list jobs`, `find jobs`
- payload attempts:
  - `{ "query": ..., "location": ..., "limit": 10 }`
  - `{ "search_term": ..., "location": ..., "limit": 10 }`
  - `{ "title": ..., "location": ..., "limit": 10 }`
  - `{ "keyword": ..., "location": ..., "limit": 10 }`
  - `{ "query": ..., "location": ..., "results_wanted": 10 }`

## Why this is acceptable for now

- simple and inspectable
- blocked-mode remains intact
- once the real schema is known, this can be tightened to the exact server/tool/arg contract

## Expected next refinement

After the first successful live query:
- pin the exact server name
- pin the exact tool name
- replace payload heuristics with the real argument shape
- map the real output fields directly into the lead schema
