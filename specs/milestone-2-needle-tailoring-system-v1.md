# Milestone 2 — Needle Tailoring System v1

_Status: canonical milestone spec_
_Last updated: 2026-03-25_

## Purpose

Turn a shortlisted job into a truthful, reviewable tailored resume draft with clear lineage.

By the end of this milestone, a shortlisted job should be able to move through:
- fit assessment
- base resume selection
- tailored draft generation
- rationale/risk review
- human approval or edit request
- clean handoff into Applying/Latch

## Primary user outcome

Benny should be able to shortlist a job, open Tailoring, and see:
- why the system thinks a certain base resume is the best starting point
- what it changed for the tailored draft
- where the draft is strong vs risky
- whether the draft is safe to approve

Approving the draft should produce a downstream-ready tailored resume record and artifact, not a loose file sitting in a random folder.

## Locked v1 decisions

- Tailored resume artifacts for v1 are markdown/structured content plus a rendered PDF.
- PDF is part of the milestone contract, not a “nice-to-have.”
- DOCX is explicitly out of the v1 contract unless Benny changes scope later.

## In scope

### 1. Fit assessment
Needle should explicitly assess the job before blindly generating a draft.

Required outputs:
- fit summary
- matched strengths
- likely gaps
- risk notes where the resume truth is thin
- recommendation for best base resume

This fit assessment does not need to be a separate end-user “product” yet, but it should exist as a first-class intermediate result.

### 2. Canonical base resume inventory
Base resumes should be durable canonical records, not only loose files.

Needle must operate against:
- a curated base resume inventory
- visible base resume titles/variants
- stable version ids
- lineage from base -> tailored

### 3. Tailoring run lifecycle
A tailoring attempt should be represented by a `tailoring_run` style entity with explicit statuses.

Suggested statuses:
- `created`
- `generating`
- `generated_for_review`
- `edits_requested`
- `approved`
- `rejected`
- `paused`
- `failed`

### 4. Draft generation
Needle should generate a tailored resume draft that is:
- truthful
- tailored to the job
- reviewable in structured form
- storable as a canonical resume version

Required outputs:
- tailored resume content
- change summary
- rationale
- risk list / unsupported-claim concerns

### 5. Human review controls
The Tailoring workspace must support:
- approve latest draft
- request edits with revision note
- pause with reason
- view run history
- compare base vs latest draft

### 6. Handoff to Applying
An approved draft should move the application cleanly into the Applying/Latch lane.

At minimum the handoff should set:
- selected tailored resume version
- application status transition into `applying`
- resume artifact attachment or pointer for downstream use
- audit events describing the approval/handoff

## Strongly recommended additions

### A. Truth-source foundation
If not already modeled explicitly, define a stable concept of “resume truth sources.”

Examples:
- canonical work experience bullets
- skills inventory
- education facts
- project facts
- achievement bank

This can be implemented lightly at first, but Needle quality will improve dramatically if generation is grounded in canonical facts rather than only in freeform resume markdown.

### B. Prompt/model version capture
Every tailoring run should capture enough metadata to explain how the draft was produced.

Recommended metadata:
- generation strategy version
- prompt/template version
- model id if relevant
- latency/cost if available

### C. Artifact rendering pipeline
Treat the textual tailored resume as canonical, but make renderable artifacts part of the milestone contract.

Required output support:
- canonical structured/markdown representation
- rendered PDF artifact suitable for downstream attachment/upload

Explicitly not required for v1:
- DOCX

### D. Diff-friendly resume structure
Store a structured document shape so Tailoring Review can show more than two opaque blobs of text.

## Out of scope

Do not build in this milestone:
- portal form filling
- application answer CRUD
- readiness engine details
- final submit review UX
- cover letter system
- auto-submission

## Domain and schema requirements

### Required canonical records
- `resume_versions`
- `tailoring_runs`
- `applications`
- `audit_events`

### Recommended additions / fields

#### `resume_versions`
Should support at least:
- `kind` (`base`, `tailored`)
- parent resume link
- canonical title
- markdown or structured content
- structured sections/document JSON
- creation source (`user`, `agent`, `import`)
- change summary
- artifact pointers if rendered
- created/approved timestamps as appropriate

#### `tailoring_runs`
Should capture:
- application id
- selected base resume id
- output resume version id
- status
- instructions / revision note
- job snapshot
- fit assessment output
- rationale list
- risk list
- change summary
- completion timestamp
- optional generation metadata (strategy/model/version)

### Suggested status semantics

#### Application status usage
- `tailoring`: waiting for draft generation or revisions
- `tailoring_review`: draft ready for human review
- `paused`: explicit human pause or blocked state
- `applying`: approved tailored resume selected and handed off downstream

## UX requirements

### Tailoring queue
Each item should show:
- application/job identity
- current application status
- selected base resume
- latest run status
- whether a tailored draft is already approved
- last update time

### Tailoring workspace
The Tailoring detail view should expose:
- job description and requirement summary
- base resume preview
- latest tailored draft preview
- fit summary
- change summary
- rationale
- risk list
- review controls
- run history
- audit trail

### Review ergonomics
The review surface should make it easy to answer:
- what changed?
- why was it changed?
- is anything risky or overstated?
- should I approve, revise, or pause?

## Recommended build order

1. **Finalize canonical resume inventory**
   - import or normalize base resume variants into `resume_versions`
   - ensure titles, ids, and structured content are stable

2. **Define fit-assessment output contract**
   - matched strengths
   - gaps
   - base resume selection rationale
   - tailoring constraints

3. **Implement base resume selection logic**
   - choose best starting resume for a given job
   - emit reasons, not just an id

4. **Implement draft generation service**
   - create `tailoring_run`
   - create tailored `resume_version`
   - store rationale/risk/change summary
   - move application into review state

5. **Implement edit-request loop**
   - revisions create new runs
   - history remains visible
   - prior drafts remain auditable

6. **Implement PDF artifact generation and linkage**
   - render PDF from the approved/latest tailored resume content path
   - store the artifact pointer deterministically
   - make the PDF available for downstream Latch attachment/upload

7. **Implement approval handoff**
   - mark run approved
   - select tailored resume on application
   - generate or attach downstream artifact pointer
   - move application into `applying`

8. **Refine review UX**
   - better side-by-side comparison
   - clearer fit/risk presentation
   - visible lineage/run history

9. **Add background execution if needed**
   - if generation becomes slow or model-backed, move it out of request lifecycle

## Acceptance criteria

The milestone is complete when all of the following are true:

### Fit assessment
- Needle produces an explicit fit/risk assessment for a shortlisted job
- base resume selection is explainable
- obvious mismatch/risk signals are preserved, not hidden

### Canonical data model
- base and tailored resumes live in `resume_versions`
- tailoring attempts live in `tailoring_runs`
- every tailored draft has lineage to a base resume and application context
- every approved downstream-ready tailored resume has a corresponding PDF artifact pointer

### Review flow
- a job/application can enter Tailoring and generate a reviewable draft
- Benny can approve, request edits, or pause
- edit requests create a visible new run rather than mutating history invisibly

### Handoff
- approving a draft selects a tailored resume for the application
- application status transitions to `applying`
- downstream resume attachment/pointer exists for Latch to consume
- the selected tailored resume is available both as canonical markdown/structured content and as a rendered PDF artifact
- audit events describe the review and handoff actions

### Safety / truthfulness
- the system surfaces risks or unsupported-claim concerns explicitly
- the workflow never treats an unapproved draft as the final selected resume

## Test plan

### Unit tests
Add/extend tests for:
- base resume selection logic
- fit assessment helpers
- document coercion/rendering helpers
- tailoring run transitions
- application transitions around tailoring states

### Fixture-based quality tests
Create realistic job + resume fixtures and verify:
- best base resume is selected consistently for known cases
- generated change summary references real adjustments
- risk flags appear when requirements are not supported by resume truth
- revision note flows alter output intent without inventing claims

### Integration tests
With a test DB, verify:
- starting an application triggers or permits a tailoring run
- a generated draft creates both run + output resume version
- approving a run updates application state and selected resume
- requesting edits creates a new run and returns application to the correct state
- pausing preserves reason and audit history
- PDF artifact generation/linkage succeeds for an approved tailored resume and stays attached to the correct resume version identity

### Manual smoke checklist
- shortlist a job
- start application
- inspect first draft
- request edits with a concrete revision note
- inspect second draft and history
- approve draft
- confirm the approved tailored resume has a valid rendered PDF artifact
- confirm application moved to Applying with correct selected resume

## Best technical practices

### Separate selection, generation, and approval
Do not collapse “generate draft” and “approve draft” into one step.

### Keep lineage explicit
Every tailored draft should know:
- which base resume it came from
- which application/job it was for
- which run created it

### Preserve review history
Do not overwrite old tailored drafts in place.

### Prefer structured resume representation
Keep markdown/rendered text for human readability, but retain a structured document for comparison and artifact generation.

### Ground on truth
The tailoring engine should bias toward re-framing proven experience, not inventing new facts to satisfy JD phrasing.

### Capture why, not just what
Rationale, change summary, and risk summary are part of the product contract.

### Don’t let UI routes own generation logic forever
If generation becomes model-backed or slow, move the orchestration into a worker/service boundary.

### Make artifact generation deterministic enough for downstream use
Latch should be able to trust that the “selected tailored resume” points to a concrete artifact identity, not an ad-hoc local file.

## Common failure modes to design for

- no suitable base resume is obvious
- a revision request produces a worse draft than the previous one
- change summaries are vague and not useful to the reviewer
- a draft looks tailored but introduces unsupported claims
- a tailored resume record exists, but downstream artifact linkage is missing
- repeated revision cycles become impossible to understand historically

## Remaining open questions

1. Should fit assessment become a separately rendered UI panel with a clear fit verdict?
2. How many base resume variants should exist in the canonical inventory for v1?
3. How explicit should unsupported-claim detection be in v1: heuristic warnings or stronger evidence mapping?
4. Should a rejected tailoring draft be represented distinctly from `edits_requested`, or is that unnecessary complexity for v1?
5. Should PDF rendering happen at generation time, approval time, or both for operational safety/performance?
