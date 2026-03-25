# Milestone 3 — Latch Application Operations v1

_Status: canonical milestone spec_
_Last updated: 2026-03-25_

## Purpose

Turn an approved tailored resume into a disciplined application workspace.

By the end of this milestone, Latch should be able to answer:
- what information is needed for this application?
- what answers already exist?
- which resume/artifacts are selected?
- what is still blocking progress?
- what is ready for final human review?

This milestone is about readiness, structure, and explainability.
It is not yet about driving a live browser aggressively.

## Primary user outcome

Benny should be able to open an application and immediately see:
- which tailored resume is selected
- which attachments will be used
- which application questions are answered vs missing
- which answers are low-confidence or blocked
- whether the application is actually ready for final review

## Locked v1 decisions

- Profile-level reusable answers are part of this milestone’s exit criteria.
- Application answers should support linkage or copy-from behavior from reusable profile answers.
- Latch should assume the selected resume artifact contract coming from Needle is markdown/structured content plus a rendered PDF.

## In scope

### 1. Applying queue
The app should provide a real Applying queue backed by canonical DB state.

Each queue item should show:
- job/company
- application status
- completion percentage
- missing required answer count
- low-confidence count
- whether hard blockers exist
- selected tailored resume summary
- portal domain if known

### 2. Application workspace
The application detail view should become the operational control surface for Latch.

Required sections:
- readiness summary
- structured answers
- attachments
- portal session summary
- recent audit events
- state transition controls into `submit_review`

### 3. Structured answer model
Answers must be field-level, not a single opaque blob.

Each answer should be able to capture:
- field key
- field label
- field group/category
- value
- whether it is required
- source type
- review state
- confidence
- last updated metadata

### 3A. Reusable answer library / profile defaults
This is part of milestone scope, not a stretch goal.

Required support:
- a user-level profile answer library for repeated application questions
- application answers can reference or be copied from a reusable profile answer
- per-application overrides remain allowed
- drift between a reusable profile answer and an overridden application answer should be visible rather than silently mutating the global default

### 4. Attachment integrity
Attachments should be explicit application records.

Minimum support:
- selected tailored resume attachment
- other attachment types as needed
- artifact URL/pointer
- link to resume version where relevant
- visible attachment inventory per application

### 5. Readiness engine
Implement or harden a readiness engine that produces:
- completion percentage
- hard blockers
- soft warnings
- recommended next action
- missing required answer count
- low-confidence answer count

### 6. Portal session tracking (lightweight)
Without full browser automation yet, Latch should still track portal context.

Minimum support:
- launch URL
- provider domain
- mode (`manual`, `automation`, `hybrid`)
- current status
- last known page title or summary
- notes

### 7. State transition to Submit Review
Latch should be able to move a ready application into `submit_review` only when gate conditions are satisfied.

## Strongly recommended additions

### A. Field taxonomy
Define a stable field taxonomy now.

Suggested categories:
- identity/contact
- authorization/visa
- compensation
- links/portfolio
- work history summary
- education
- EEO/self-ID
- freeform/custom
- uploads

### B. Dirty-state semantics
If a ready application changes after review prep, the system should know that its prior readiness snapshot is stale.

## Out of scope

Do not build in this milestone:
- real live portal form filling
- automatic submit
- ATS-specific automation adapters
- complex multi-user collaboration
- full submission history dashboards

## Domain and schema requirements

### Required canonical records
- `applications`
- `profile_answers`
- `application_answers`
- `application_attachments`
- `portal_sessions`
- `resume_versions`
- `audit_events`

### Recommended additions / fields

#### `profile_answers`
Should support at least:
- `userId` or owner identity
- `fieldKey`
- `fieldLabel`
- `fieldGroup`
- answer payload/value
- `sourceType`
- `reviewState`
- `confidence`
- optional notes/rationale
- active/archived semantics
- created/updated timestamps

#### `application_answers`
Should support at least:
- `applicationId`
- `profileAnswerId` where the answer originated from a reusable default
- `fieldKey`
- `fieldLabel`
- `fieldGroup`
- answer payload/value
- `required`
- `sourceType` (`manual`, `agent`, `resume`, `profile`, `derived`, `portal_detected` as needed)
- `reviewState` (`accepted`, `needs_review`, `blocked`)
- `confidence`
- optional portal mapping metadata later

#### `application_attachments`
Should support at least:
- application id
- attachment type (`resume`, `cover_letter`, `other`) even if cover letters stay unused for now
- filename/display name
- file URL or artifact pointer
- related `resumeVersionId` where relevant
- creation metadata

#### `portal_sessions`
Should support at least:
- application id
- mode
- status
- provider domain
- launch URL
- last synced/updated time
- summary notes
- session summary JSON for future browser evidence

#### `applications`
Recommended operational fields beyond status:
- completion percent cache
- missing required count cache
- low confidence count cache
- portal URL/domain summary
- paused reason if needed
- selected tailored resume version id

## Readiness contract

The readiness engine should remain deterministic and explainable.

### Minimum hard blockers
Suggested blocker classes:
- tailored resume missing
- resume attachment missing
- selected resume vs attached resume mismatch
- required answers missing
- blocked answers present

### Minimum soft warnings
Suggested warning classes:
- low-confidence answers present
- portal session not started / not ready
- optional attachment missing where policy says it is recommended

### Recommended next action
The engine should always suggest the single clearest next step.
Examples:
- select tailored resume
- attach resume artifact
- complete missing required answers
- review low-confidence answers
- register portal session
- move to submit review

## UX requirements

### Applying queue
Should support quick scanning by surfacing:
- status
- readiness summary
- blocker/warning counts
- updated-at time
- selected tailored resume title
- portal domain

### Application detail workspace
Required sections:
- job header and application status
- readiness summary panel
- structured answers list/editor
- attachment manager
- portal session list/editor
- audit history
- transition controls

### Answer editing ergonomics
The UI should make it easy to:
- add missing answers
- update one answer without touching others
- see required vs optional
- understand why an answer is flagged

### Attachment ergonomics
The UI should make it obvious:
- which resume is attached
- whether it matches the selected tailored resume
- which non-resume artifacts exist

## Recommended build order

1. **Finalize answer, reusable-profile-answer, and attachment semantics**
   - required vs optional
   - review states
   - confidence policy
   - profile answer ownership/linkage/override behavior
   - attachment types and selected-resume behavior

2. **Implement reusable profile answer library**
   - create/edit/archive reusable answers
   - copy-from or link-to application answers intentionally
   - make override drift visible

3. **Implement or refine readiness engine**
   - blocker taxonomy
   - warning taxonomy
   - completion calculation
   - recommended next action rules

4. **Harden Applying read model**
   - queue summaries
   - item ordering
   - per-application metrics

5. **Build richer application workspace**
   - answers CRUD
   - attachment CRUD
   - portal session CRUD
   - audit visibility

6. **Enforce transition gate into `submit_review`**
   - only ready applications advance
   - transition emits clear audit event

7. **Add dirty-state semantics if packet changes after readiness**
   - recommended to support Milestone 4 cleanly

## Acceptance criteria

The milestone is complete when all of the following are true:

### Application structure
- approved tailored resumes can be consumed downstream in Applying
- answers are stored field-by-field rather than as one opaque blob
- reusable profile answers exist and can be linked/copied into application answers intentionally
- attachments are explicit and auditable
- portal session context can be registered and updated

### Readiness
- the application workspace explains why an application is or is not ready
- hard blockers and warnings are visible
- recommended next action is meaningful
- readiness metrics update as answers/attachments/session state changes

### Queue flow
- the Applying queue renders real applications from canonical DB state
- a ready application can move to `submit_review`
- a not-ready application cannot advance silently

### Auditability
- answer edits emit audit events
- attachment changes emit audit events
- portal session registration/updates emit audit events
- readiness-related status transitions emit audit events

## Test plan

### Unit tests
Add/extend tests for:
- readiness rules
- blocker/warning taxonomy
- answer requiredness/value detection
- attachment-match logic
- application transition rules into `submit_review`

### Integration tests
With a test DB, verify:
- approving a tailored resume results in a valid Applying item
- missing required answers block readiness
- adding required answers updates readiness metrics
- mismatched attachment blocks readiness
- low-confidence answers warn but do not hard-block unless policy says so
- portal session registration updates summary state
- reusable profile answers can seed application answers without mutating the global default unexpectedly
- moving to `submit_review` is allowed only when ready

### Readiness matrix tests
Create a fixture matrix covering cases such as:
- no tailored resume selected
- tailored resume selected but attachment missing
- attachment present but wrong resume version
- all required answers complete
- blocked answer present
- only low-confidence answers remain
- portal session absent
- portal session ready for review

### Manual smoke checklist
- approve a tailored resume from Tailoring
- open Applying queue
- inspect readiness state
- create or reuse a profile-level answer
- seed an application answer from the reusable profile answer
- override one application answer intentionally and confirm the reusable default stays intact
- add attachment
- register portal session
- confirm readiness updates
- move to Submit Review

## Best technical practices

### Keep answers atomic
One field, one record, one review state.
Do not revert to giant answer blobs.

### Separate reusable profile knowledge from application-specific answers
If profile defaults exist, copy or link them intentionally rather than mutating the global source accidentally.

### Preserve provenance for answers
A future browser fill engine will need to know where each answer came from.

### Make readiness explainable
A score without reasons is not enough.

### Avoid portal-specific leakage into the generic answer model too early
Field mapping metadata can exist, but the core answer model should stay general.

### Keep sensitive data handling in mind
Application answers may contain private information.
Plan for redaction or careful display rules where appropriate.

### Recompute or invalidate readiness predictably
Do not let cached readiness drift silently from current answers/attachments.

### Treat the selected tailored resume as a contract
If the attached resume differs from the selected version, surface it clearly as a blocker.

## Common failure modes to design for

- answers exist but are too low-confidence to trust
- the wrong resume artifact is attached
- the application looks “complete” but required answers are actually empty
- a portal URL is known, but no meaningful session context exists
- users update answers after readiness was previously achieved
- per-application answers drift from reusable defaults and no one notices

## Remaining open questions

1. Which answer categories deserve hard schema support first?
2. Do we want a dedicated “blocked by human decision” state distinct from field-level blocked answers?
3. Should portal session notes include lightweight evidence pointers before Milestone 5?
4. How much PII redaction should exist in the UI before this lane is considered production-safe?
5. Should reusable profile answers support version history immediately, or can that wait until after the first stable implementation?
