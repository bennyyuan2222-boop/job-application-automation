# Job Application System

This folder is the working home for Benny's semi-automated job application system.

## High-level architecture

The system is split into cooperating agents:

1. **job-search**
   - Finds promising roles from job sources
   - Deduplicates and logs leads
   - Maintains search history and queue candidates for tailoring/review

2. **resume-tailor**
   - Adapts resume bullets/summary to a target job
   - Produces tailored resume variants and notes

3. **operations**
   - Helps prepare and complete application forms
   - Produces a human-review package before submission
   - Never submits silently without Benny's inspection/approval

4. **result-record**
   - Tracks applications, stages, interviews, rejections, follow-ups, and outcomes
   - Keeps metrics and process visibility clean

## Folder layout

- `specs/` — product/system specs and agent contracts
- `agents/` — per-agent role definitions and operating instructions
- `data/` — structured records, queues, and tracking files
- `resumes/` — base and tailored resume materials
- `cover-letters/` — cover letter templates and tailored drafts
- `artifacts/` — generated outputs for review (job packets, application packets)
- `logs/` — run logs and agent summaries
- `research/` — notes on MCPs, job boards, company intelligence, experiments
- `scripts/` — local helper scripts later, if needed

## Ground rules

- Human approval before final submission
- Keep canonical records in `data/`
- Prefer append-only logs for search history and application history
- Keep agent instructions explicit enough that a sub-agent can operate with minimal ambiguity
