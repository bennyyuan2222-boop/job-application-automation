# Lead Record Schema v1

Purpose: define the canonical normalized record shape for `data/leads/leads.jsonl` so sourcing runs stay consistent and downstream agents get clean handoff data.

## Canonical JSONL shape

Each line in `data/leads/leads.jsonl` should be one JSON object.

```json
{
  "id": "indeed:abc123",
  "source": "indeed",
  "source_job_id": "abc123",
  "search_term": "data analyst",
  "search_location": "New York, NY",
  "searched_at": "2026-03-16T22:05:00-04:00",
  "title": "Data Analyst",
  "company": "Example Co",
  "location": "New York, NY",
  "remote": true,
  "hybrid": null,
  "url": "https://example.com/job/abc123",
  "date_posted": "2026-03-15",
  "salary": "$80k-$100k",
  "employment_type": "full-time",
  "seniority_hint": "entry",
  "industry_hint": "b2b saas",
  "summary": "Brief extracted description or notes.",
  "decision": "keep",
  "scores": {
    "title_fit": 4,
    "location_fit": 5,
    "industry_fit": 4,
    "seniority_fit": 4,
    "overall": 4
  },
  "reason": "Strong analyst fit in a preferred geography with AI-adjacent work.",
  "signals": [
    "nyc",
    "ai-adjacent",
    "entry-level"
  ],
  "risks": [
    "salary not listed"
  ],
  "next_step": "send to resume-tailor",
  "status": "new",
  "run_id": "2026-03-16-run-01"
}
```

## Required fields

- `id`
- `source`
- `search_term`
- `searched_at`
- `title`
- `company`
- `location`
- `url`
- `decision`
- `scores`
- `reason`
- `status`
- `run_id`

## Preferred fields

- `source_job_id`
- `search_location`
- `remote`
- `hybrid`
- `date_posted`
- `salary`
- `employment_type`
- `seniority_hint`
- `industry_hint`
- `summary`
- `signals`
- `risks`
- `next_step`

## Scoring guidance

Scores are 1-5.

- `title_fit`: directness of role/title match to Benny’s target roles
- `location_fit`: geography and work-mode fit
- `industry_fit`: company/sector attractiveness relative to spec
- `seniority_fit`: match to entry/junior preference and plausible attainability
- `overall`: practical first-pass enthusiasm score

## Decision guidance

- `keep`: strong enough to preserve for downstream review/tailoring
- `maybe`: uncertain but potentially worth later review
- `discard`: noisy, weak, duplicate, stale, or misaligned

## Notes

- Do not overwrite prior lead records silently.
- If a listing reappears with new information, append a new record or preserve an update trail in a future enrichment workflow.
- Keep rationales plain-English and short.
