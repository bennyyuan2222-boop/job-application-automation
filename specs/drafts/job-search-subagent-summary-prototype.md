# Job Search Sub-Agent Summary

_Date: 2026-03-16_

## 1. Mission

My mission is to continuously source relevant job opportunities for Benny, filter out weak or noisy listings, deduplicate results, and log high-signal leads into the tracker so downstream resume-tailoring and application work can happen efficiently.

In practical terms, that means:
- focusing on Data Analyst, Business Analyst, Analytic Engineer, AI PM, and adjacent AI solutions roles
- optimizing for useful leads per review minute, not raw volume
- running focused searches, normalizing results, scoring fit, and recording clear reasoning
- maintaining a clean, explainable handoff for later application steps

## 2. Current limitations

Current limitations implied by the specs:

1. I currently depend on the JobSpy MCP server / mcporter path for sourcing. If that endpoint is unavailable, my core search workflow is blocked.
2. I am designed only for sourcing and triage, not for applying, contacting employers, or modifying resumes.
3. My scoring is intentionally simple and first-pass only, so I can classify leads but not make nuanced strategic decisions without more logic or tools.
4. The search spec is still broad and underdefined in places, which limits precision. For example, title priority, exact AI-solution role definitions, and stronger exclusion criteria are not fully specified.
5. I do not yet appear to have an implemented automated workflow for recurring search runs, dedupe enforcement, freshness tracking, or downstream routing.
6. I rely on existing workspace files and lead history; if those files are missing, inconsistent, or not normalized, deduplication and continuity become weaker.
7. I can log uncertainty as `maybe`, but I do not yet have a richer review/feedback loop to learn from Benny’s preferences over time.

## 3. First 5 technical abilities that should be added

### 1) Reliable JobSpy MCP connectivity + health check
I need a concrete, testable integration layer to the JobSpy MCP server, including:
- connection validation
- query execution
- timeout/retry handling
- graceful failure messages

Without this, my main sourcing ability is fragile.

### 2) Canonical lead deduplication engine
I need a real dedupe layer that can match across:
- source-specific IDs
- normalized company/title/location combinations
- duplicate URLs or tracking variants
- reposted listings

This prevents noisy lead logs and wasted review time.

### 3) Search orchestration for batched multi-query runs
I need a repeatable search runner that can:
- execute multiple targeted title/location queries in one batch
- track which searches were run
- limit noisy overbroad queries
- preserve search metadata for each result

This is the backbone of disciplined recurring sourcing.

### 4) Structured scoring and ranking pipeline
I need an implemented scoring module that converts raw listings into:
- title/location/industry/seniority/overall scores
- keep/maybe/discard decisions
- short human-readable rationales

Right now this exists as a spec, but not yet as an operational system.

### 5) Run logging + downstream handoff automation
I need automatic output writing that:
- appends valid lead records to `data/leads/leads.jsonl`
- appends run summaries to `data/leads/search-runs.md`
- optionally creates dated analysis notes
- clearly marks next steps for downstream agents

This turns one-off searches into a durable pipeline.

## 4. First concrete workflow to implement

## Workflow: "One disciplined sourcing run"

This should be the first implemented end-to-end workflow:

1. Load `job-search-spec.md`.
2. Load existing `data/leads/leads.jsonl`.
3. Run 5-10 focused searches across top-priority titles and realistic locations.
4. Normalize returned job records into a common schema.
5. Deduplicate against prior leads and within the current batch.
6. Score each result on title fit, location fit, industry/company fit, seniority fit, and overall enthusiasm.
7. Assign `keep`, `maybe`, or `discard` with a one-line reason.
8. Append only useful new leads to `data/leads/leads.jsonl`.
9. Append a concise run summary to `data/leads/search-runs.md`.
10. Recommend the next search angle based on gaps or weak coverage.

### Why this first

This workflow creates the minimum viable operating loop described across the documents. It gives me a repeatable mechanism to produce actual value immediately, while setting up the data needed for later improvements like preference learning, resume tailoring, and application prioritization.

## 5. Short bottom line

I am specified well enough to behave like a disciplined sourcing analyst, but not yet implemented as a robust autonomous pipeline. The first priority is to build the search-to-dedupe-to-score-to-log loop so I can produce consistent, reviewable job leads with minimal noise.
