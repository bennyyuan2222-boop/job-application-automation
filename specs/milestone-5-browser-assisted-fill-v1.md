# Milestone 5 — Browser-Assisted Portal Fill v1

_Status: canonical milestone spec_
_Last updated: 2026-03-25_

## Purpose

Allow Latch to fill supported live application portals up to, but not including, the final submit click.

By the end of this milestone, the system should be able to:
- open a supported portal session
- inspect fields on the live form
- map supported fields to canonical application answers
- upload the correct resume/artifacts
- fill what it can safely fill
- stop before final submission
- preserve evidence and status for Benny’s final live review

This is intentionally an assisted-automation milestone, not an autonomy milestone.

## Primary user outcome

Benny should be able to move a prepared application into a browser-assisted mode where Latch does the repetitive form work, while Benny still owns the final portal review and submit click.

## Locked v1 decisions

- Greenhouse is the first ATS family to support for real browser-assisted fill.
- The browser-fill architecture must remain adapter-friendly and capability-based so later ATS families can be added without overfitting everything to Greenhouse.
- The default upload target for resume uploads should be the selected tailored resume PDF artifact produced earlier in the pipeline.

## Scope strategy

This milestone should be implemented in controlled sub-phases rather than as one huge jump.

### Phase 5A — Inspection-only foundation
Build the ability to open a portal, inspect the form, classify fields, and store a useful portal session summary.

### Phase 5B — Supported field fill
Fill safe, common field types on supported forms.

### Phase 5C — Upload and review handoff
Upload resume/attachments where supported, capture completion/evidence, and stop before final submit.

## In scope

### 1. Portal session orchestration
Create a robust way to represent and resume live portal sessions.

Required concepts:
- session mode (`manual`, `automation`, `hybrid`)
- session status (`not_started`, `in_progress`, `ready_for_review`, `submitted`, `abandoned`)
- launch URL
- provider domain / ATS type if detected
- last known page/title/summary
- last sync timestamp
- evidence pointers or summary data

### 2. Field extraction and classification
The browser layer must inspect a live form and classify what it finds.

Minimum field classes to support initially:
- text input
- textarea
- select/dropdown
- radio group
- checkbox
- file upload

At inspection time, the system should attempt to capture:
- label text
- name/id attributes if helpful
- requiredness
- visible options for select/radio where feasible
- portal-specific field identifier
- mapping confidence to internal answer model

### 3. Mapping engine
Build a mapping layer from portal fields to canonical application data.

Sources for mapping may include:
- application answers
- reusable profile answers
- selected tailored resume metadata
- attachments/artifact pointers
- portal heuristics

The mapping engine should output one of:
- confidently mapped value
- low-confidence suggested value
- unsupported / needs human attention
- intentionally skipped

### 4. Safe fill engine
Support filling of safe, common fields on supported portals.

Rules:
- only fill fields with acceptable confidence
- preserve explicit logs/evidence of what was filled
- stop or flag when field semantics are ambiguous
- do not silently invent values

### 5. Upload handling
Support uploading the correct resume artifact at minimum.

Requirements:
- selected tailored resume must be the default upload target
- upload behavior must be auditable
- if the portal requires a format the system does not have, surface a blocker clearly

### 6. Review handoff
After browser fill completes, the system should leave the application in a reviewable state.

Required outputs:
- portal session updated to `ready_for_review` when appropriate
- evidence of fill steps taken
- unsupported/unfilled fields summary
- clear next action for Benny

## Strongly recommended additions

### A. ATS compatibility matrix
Do not treat “browser fill” as one monolith.
Track support by portal family.

Suggested first-class ATS support matrix:
- Greenhouse (**required first end-to-end target for v1**)
- Lever
- Workday
- Ashby
- Custom/unknown

Each should track support level such as:
- inspection only
- partial fill
- upload support
- review-ready support

### B. Local test harness / fake forms
Before hitting real portals broadly, maintain a local or test-hosted set of representative forms to validate extraction/fill behavior safely.

### C. Portal-specific adapters over one giant generic driver
Some generic fill logic is useful, but provider-specific quirks will matter quickly.

## Out of scope

Do not build in this milestone:
- automatic final submit click
- credential storage in source-controlled repo files
- pretending every ATS can be supported equally well in v1
- replacing Benny’s final judgment on the live page

## Domain and schema requirements

### Required canonical records
- `applications`
- `application_answers`
- `application_attachments`
- `portal_sessions`
- `audit_events`

### Recommended additions / fields

#### `portal_sessions`
May need to expand to include:
- detected ATS type
- last inspection summary
- completion stats from browser fill
- unsupported fields summary
- evidence pointers
- last error summary
- session/run correlation ids

#### Optional browser evidence records
Consider a dedicated table or storage pattern for:
- screenshots
- extracted field snapshots
- fill attempt summaries
- upload evidence

The DB can store references; large binaries should live in object storage.

## Browser runtime requirements

### Session model
Decide explicitly how live browser work will run.
Possible modes:
- managed browser session
- attached user browser session
- hybrid approach

Whatever mode is used, the product must account for:
- login requirements
- expiring sessions
- user-presence requirements
- retry/resume semantics

### Long-running execution
Browser fill should not depend on a fragile single web request.

Recommended approach:
- worker/service orchestration
- resumable session state
- explicit task status updates

## UX requirements

### Applying / review surfaces
The application UI should show:
- whether browser fill has not started / is in progress / is ready for review / failed
- what percentage of fields were filled vs skipped
- which fields require human attention
- which files were uploaded
- portal URL and latest page summary

### Browser fill summary
After a fill pass, the UI should expose:
- filled fields count
- skipped/unsupported fields count
- upload status
- last run time
- notable warnings/errors
- ready-for-review vs blocked state

## Recommended build order

### Step 1 — Build the form test harness
Create representative fake forms for:
- basic text/select/radio/checkbox inputs
- required vs optional fields
- file upload
- multi-step flow if feasible

This is the safest place to debug extraction and fill behavior first.

### Step 2 — Harden portal session model
Ensure sessions can track:
- launch URL
- provider/ATS type
- summary state
- evidence pointers
- errors
- timestamps

### Step 3 — Implement inspection-only pass
For a supported page, extract fields and classify them without filling anything.

Success here should produce:
- field inventory
- mapping candidates
- unsupported field list
- portal session summary

### Step 4 — Implement mapping engine
Connect extracted fields to canonical answers/attachments.
Start with high-confidence mappings only.

### Step 5 — Implement safe fill primitives
Add controlled support for:
- text inputs
- textarea
- select
- radio
- checkbox

### Step 6 — Implement upload flow
Add resume upload, then additional attachments if justified.

### Step 7 — Add ATS-specific adapters
Implement Greenhouse first as the required initial real adapter.
Then generalize lessons into the broader adapter/capability model instead of hardcoding everything around Greenhouse forever.

### Step 8 — Integrate with Submit Review handoff
Browser fill should culminate in a clean review-ready state, not an ambiguous “maybe done” state.

## Acceptance criteria

The milestone is complete when all of the following are true:

### Inspection
- the system can inspect a supported live form and build a useful field inventory
- extracted fields are classified and summarized clearly
- unsupported fields are surfaced explicitly

### Mapping
- supported fields can be mapped to canonical answers or attachments with visible confidence rules
- low-confidence mappings are flagged rather than filled blindly

### Fill behavior
- the system can fill supported field types on at least one real Greenhouse flow end-to-end up to the review boundary
- the system can upload the selected tailored resume PDF artifact where supported
- fill actions are logged and auditable

### Review boundary
- the automation stops before final submit
- the application lands in a clean reviewable state for Benny
- portal session status and summary reflect what happened

## Test plan

### Unit tests
Add/extend tests for:
- field classification helpers
- mapping-confidence rules
- ATS adapter capability detection
- unsupported-field handling

### Harness-based integration tests
Using local fake forms, verify:
- field extraction works across common controls
- required fields are recognized
- mapped values are filled correctly
- low-confidence mappings are not auto-filled
- file upload uses the correct resume artifact

### Real-portal smoke tests
For each supported ATS family, maintain a small smoke checklist that verifies:
- inspection works
- at least one representative application page can be filled partially or fully up to review boundary
- unsupported fields are surfaced safely

Greenhouse is the required first real smoke target for milestone exit.
Other ATS families may remain inspection-only or partial until explicitly upgraded.

### Regression strategy
Maintain recorded examples / fixtures for previously supported portals so adapter changes do not silently break working flows.

### Manual smoke checklist
- prepare a ready application with selected resume and answers
- launch portal session
- run inspection-only mode
- inspect extracted field summary
- run fill mode on supported fields
- confirm resume uploaded correctly
- confirm unsupported fields are listed clearly
- verify automation stopped before final submit

## Best technical practices

### Never auto-submit
This is the central safety boundary.

### Prefer capability-based support over pretending everything works
It is better to say “inspection only” for a portal than to imply reliable full fill support when it is flaky.

### Separate portal adapters from generic orchestration
The orchestrator should manage runs/sessions; adapters should encode ATS-specific knowledge.

### Preserve evidence
Screenshots, summaries, and fill logs are part of trust, debugging, and user review.

### Treat low-confidence mapping as a first-class outcome
Ambiguity is not failure if it is surfaced clearly.

### Keep browser work resumable
Live portals time out, reload, and fail. Design for pause/resume.

### Avoid storing secrets in product state casually
Credentials/session tokens need careful handling and should not spill into normal DB records or source control.

### Do not drive the browser from the UI request path long-term
Use background orchestration for anything non-trivial.

## Common failure modes to design for

- ATS markup changes and breaks selectors/classification
- a portal requires login or multi-factor interaction mid-run
- file upload controls behave differently than generic inputs
- ambiguous labels cause the wrong answer to be selected
- a multi-step application form partially saves and partially fails
- the portal reaches the final review page but the system lacks enough evidence to trust what happened

## Remaining open questions

1. Which ATS family should be second after Greenhouse?
2. Should Milestone 5 exit require one real ATS family end-to-end, or two?
3. What minimum evidence should be captured per browser fill pass: screenshot set, structured field summary, or both?
4. Which browser runtime/session strategy is intended long-term for authenticated portals?
5. Do we want a dedicated compatibility/support matrix page in the product, or is internal ops documentation enough at first?
