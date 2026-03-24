# System Overview

## Objective

Build a semi-automated job application system that separates discovery, tailoring, operations, and record-keeping into distinct agents with clear handoffs.

## Core workflow

1. **Job-search agent** finds jobs and records them in a structured lead tracker.
2. **Resume-tailor agent** takes approved leads and creates tailored materials.
3. **Operations agent** assembles application inputs, helps fill forms, and prepares a review package.
4. **Result-record agent** tracks status changes over time.

## Desired properties

- Reproducible, inspectable work
- Minimal duplicated effort
- Human review before irreversible actions
- Easy to swap tools/components later
- Clean handoff between agents using files, not fragile chat memory

## Canonical records

- `data/leads/leads.jsonl` — one JSON record per discovered lead
- `data/leads/search-runs.md` — human-readable run notes
- `data/applications/applications.jsonl` — one JSON record per application event
- `data/applications/pipeline-board.md` — current stage summary
- `data/metrics/weekly-metrics.md` — throughput and conversion summary

## Near-term priority

Get the **job-search agent** highly reliable first. A weak search pipeline contaminates every downstream step.
