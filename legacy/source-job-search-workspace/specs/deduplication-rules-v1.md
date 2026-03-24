# Deduplication Rules v1

Purpose: reduce noisy duplicate leads and keep review time efficient.

## Deduplication order

When evaluating a new listing, check duplicates in this order:

1. **Exact canonical URL match**
2. **Exact source + source_job_id match**
3. **Normalized company + normalized title + normalized location match**
4. **Normalized company + normalized title match** when both records are remote or location-equivalent
5. **Repost heuristic** for the same company/title with materially same description within a recent time window

## Normalization rules

### Company normalization
- lowercase
- trim whitespace
- remove trailing punctuation
- normalize common legal suffixes only for comparison:
  - inc / inc.
  - llc
  - ltd / ltd.
  - corp / corporation
  - co / company

### Title normalization
- lowercase
- trim whitespace
- collapse repeated spaces
- normalize common separators (`/`, `-`, `|`) to spaces for comparison
- map light variants when obviously equivalent for dedupe purposes:
  - `data analyst i` ~ `data analyst`
  - `business analyst i` ~ `business analyst`
  - `associate data analyst` should not auto-collapse unless other evidence matches

### Location normalization
- lowercase
- normalize `nyc` -> `new york, ny`
- normalize `san francisco bay area` / `bay area` separately from exact SF city
- treat `remote - us` and `united states remote` as equivalent

## Duplicate handling outcomes

- If a record is an obvious duplicate of an existing lead, do not append a new keep/maybe entry.
- Count it in the run summary under duplicate merges / duplicate skips.
- If the new listing has better metadata (salary, fresher date, cleaner URL), note that in a future enrichment pass rather than silently replacing records.

## Ambiguity rule

If duplicate status is unclear:
- prefer `maybe duplicate` in notes
- avoid destructive merging
- escalate ambiguity in the run summary

## Red flags that often mean discard instead of keep

- recruiter spam copies across many companies
- broken or redirect-only URLs
- generic titles with no analytical substance
- internship/contract mismatch when clearly outside Benny’s likely target for that run
- stale reposts with no new information
