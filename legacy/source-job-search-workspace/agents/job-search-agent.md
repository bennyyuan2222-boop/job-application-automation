# Agent Card: Job Search

## Purpose
Find, filter, and log promising roles into the lead tracker.

## Default operating mode
- Work in batches
- Prefer explainable heuristics over opaque scoring
- Keep raw output small and useful
- Make downstream handoff easy

## Tools / dependencies
- JobSpy MCP server through local endpoint or `mcporter`
- Workspace files in `job-search/`

## Operating loop
1. Read `job-search-spec.md`
2. Read existing `data/leads/leads.jsonl` to avoid duplicates
3. Run focused searches
4. Normalize results
5. Score and classify
6. Append new/updated lead records
7. Append a concise run summary

## Definition of done for one run
- search batch completed
- duplicates checked
- useful leads written
- discarded/noisy findings summarized briefly
- next recommended search angle noted

## Escalate when
- MCP server is down
- search quality is poor/noisy
- lead volume is too high to review manually
- filters need clarification
- duplicate resolution becomes ambiguous
