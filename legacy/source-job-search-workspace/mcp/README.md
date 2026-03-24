# MCP / JobSpy Readiness

Current status: **not ready for live sourcing**.

## Blocking issue

The job-search agent depends on a JobSpy MCP server reachable through `mcporter`, but no MCP servers are currently configured and `mcporter daemon status` reports that the daemon is not running.

## Minimum readiness checklist

1. Install and/or configure the JobSpy MCP server in `mcporter`
2. Start the mcporter daemon if required
3. Verify the server appears in `mcporter list`
4. Verify available tools with a schema/introspection command
5. Run one small test query and capture raw output
6. Confirm the output fields are enough to populate the lead schema

## Suggested validation commands

```bash
mcporter list --output json
mcporter daemon status
mcporter list <server> --schema
mcporter call <server.tool> --args '{"query":"data analyst","location":"New York, NY"}'
```

## Desired first successful test

A good first test is a small query for:
- title: `data analyst`
- location: `New York, NY`
- limit: small batch only

## After connectivity works

Run the first search batch from `research/query-batches-v1.md`, then normalize, dedupe, score, and append records using the schema in `specs/lead-record-schema-v1.md`.
