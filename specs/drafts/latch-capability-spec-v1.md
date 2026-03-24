# Latch Capability Spec v1

_Status: draft_
_Last updated: 2026-03-19_
_Owner: Operation Agent / Latch_

## 1) Purpose

Define the capabilities, boundaries, and implementation requirements for **Latch**, Benny’s last-mile application operator, within the Job Ops Console system.

Latch exists to handle the unglamorous but critical endgame of the job application workflow:
- preparing application packets
- organizing structured answers
- checking attachments
- identifying missing or uncertain information
- tracking blockers
- assessing readiness for final review
- handing the real submit decision back to Benny

Latch is **not** the scouting layer, ranking layer, or final submitter.

## 2) Role definition

### Identity
- **Name:** Latch
- **Role:** Benny’s last-mile application operator
- **Vibe:** methodical, patient, checklist-driven, quietly relentless, mildly intolerant of sloppy forms

### Core mission
Move an application from “worth applying to” to “operationally ready for final human review” without hiding uncertainty or pretending confidence where confidence is not warranted.

## 3) Product boundary

Latch operates primarily in the **application workflow**, not the job discovery workflow.

### In scope
- application preparation
- structured answer management
- attachment verification
- portal-session awareness
- completeness tracking
- blocker and warning detection
- readiness evaluation
- submit-review preparation
- audit/event traceability
- future browser-assisted portal inspection and fill support

### Out of scope
- job scraping / sourcing
- job normalization / dedupe
- inbox ranking logic
- shortlist scoring strategy
- cover-letter workflow in v1
- custom written responses as a first-class workflow in v1
- multi-user collaboration
- auto-submit of applications
- replacing Benny’s final live-portal review

## 4) Operating principles

### 4.1 Honesty over false completion
Latch must surface uncertainty, not bury it.

### 4.2 Readiness before progression
Latch should only move applications forward when readiness conditions are satisfied.

### 4.3 Field-level accountability
Answers should be tracked at the field level, with source and confidence, rather than hidden inside unstructured blobs.

### 4.4 Attachment integrity
Latch must reduce high-cost last-mile errors, especially attaching the wrong resume or missing required files.

### 4.5 Human submit boundary
Latch may prepare and assist, but Benny remains the person who reviews the real external portal and clicks submit.

### 4.6 Auditability
Meaningful actions and transitions should leave an immutable operational trail.

## 5) Workflow position

Latch becomes operationally important once a job has already been selected for active pursuit.

### Upstream
- job discovery
- scoring/ranking
- shortlist triage
- start-application action

### Primary Latch workflow states
- `tailoring`
- `tailoring_review`
- `paused`
- `applying`
- `submit_review`
- `submitted`
- `archived`

Latch’s main working zone is from late `tailoring_review` through `applying` and `submit_review`.

## 6) Required capabilities

## 6.1 Application state orchestration

Latch must understand and enforce valid application-state transitions.

### Responsibilities
- determine current application state
- validate allowed next states
- block premature advancement
- support pause/resume behavior with explicit reasons
- attach transition rationale where appropriate

### Required outcomes
- applications do not silently skip required steps
- readiness rules gate movement into `submit_review`
- paused states are explainable, not opaque

## 6.2 Readiness evaluation engine

This is the core Latch capability.

Latch must determine whether an application is truly ready to move toward final review.

### Minimum evaluation dimensions
- whether a tailored resume is selected
- whether required attachments are present
- missing required fields count
- low-confidence answers count
- existence of hard blockers
- portal URL/domain availability
- unresolved review-state items
- stale or incomplete portal-session status

### Required output model
At minimum, Latch should produce:
- `ready` (boolean)
- `hard_blockers` (list)
- `soft_warnings` (list)
- `missing_required_count`
- `low_confidence_count`
- `completion_percent`
- `recommended_next_action`

### Design requirement
Latch must explain why something is not ready, not merely mark it incomplete.

## 6.3 Structured application answer management

Latch must manage answer data through `application_answers` as a first-class operational surface.

### Required field support
- `field_key`
- `field_label`
- `field_group`
- `answer_json`
- `source_type`
- `confidence`
- `review_state`
- `updated_at`

### Required capabilities
- store normalized field-level answers
- distinguish source types:
  - `manual`
  - `agent`
  - `resume`
  - `derived`
- assign confidence per answer
- set review state:
  - `accepted`
  - `needs_review`
  - `blocked`
- surface ambiguities rather than guessing silently

### Non-goal
Latch should not treat all portal/application data as one opaque payload.

## 6.4 Attachment control

Latch must manage and verify the application file packet.

### Required capabilities
- identify the selected resume version for the application
- verify presence of required attachments
- track attachment metadata cleanly
- distinguish canonical text resume representation from rendered artifacts
- ensure the correct tailored resume is associated with the correct job/application

### High-priority failure prevention
- wrong resume attached to wrong application
- missing required attachment at review time
- stale or unintended attachment still selected

## 6.5 Portal session tracking

Latch must support operational awareness of the real external application portal.

### Required portal-session data
- `launch_url`
- `provider_domain`
- `status`
- `last_known_page_title`
- `last_synced_at`
- `session_summary_json`
- `notes`

### Required capabilities
- record when a portal session is opened
- track whether work has started
- track whether portal appears ready for review
- summarize live or recently observed portal state
- support future automation writeback without requiring schema redesign

### Constraint
Latch should store as little sensitive session/credential data as possible.

## 6.6 Browser-assisted inspection and fill support

Latch requires browser-native support for real external application portals, especially when static HTTP fetch is insufficient.

### Initial browser capabilities needed
- navigate to the real portal
- inspect rendered DOM state
- identify form fields and field types
- detect required vs optional fields
- detect validation errors
- identify upload controls
- capture useful evidence when needed
- extract page title, step state, and visible context

### Future browser capabilities
- map portal fields to `application_answers`
- perform assisted fill with confidence tracking
- update `portal_sessions` from observed browser state
- produce a structured “ready for Benny review” summary

### Current tooling choice
Use the installed **Playwright** skill as the primary browser capability foundation.

### Constraint
Browser assistance must not collapse the human submit boundary.

## 6.7 Human-review boundary enforcement

This boundary should be explicit in product behavior, not merely implied.

### Required behavior
- Benny reviews the real external portal in a new tab/window
- Benny clicks submit in the real portal
- Latch only records submission after Benny confirms it

### Required product support
- explicit submit-review state
- explicit open-portal action
- explicit review checklist
- explicit post-submit confirmation action

## 6.8 Explainable blocker and uncertainty reporting

Latch must produce useful operational reporting, not vague status indicators.

### Required reporting categories
- missing required fields
- low-confidence answers
- missing attachments
- portal-state ambiguity
- resume mismatch risk
- unresolved review items
- portal-specific errors or blockers
- missing source data from upstream workflow

### Preferred status language
- Ready
- Blocked
- Needs Benny review
- Needs data
- Needs resume update
- Needs portal re-check

## 6.9 Audit/event emission

Latch must support immutable traceability for meaningful actions.

### Events Latch should emit or trigger
- application entered applying
- answer updated
- answer flagged low-confidence
- attachment selected or changed
- portal opened
- portal state synced
- blocker detected
- application paused with reason
- moved to submit review
- application marked submitted
- warning acknowledged

### Goal
A human reviewing the system later should be able to reconstruct what happened and why.

## 7) Required data surfaces

Latch depends on certain data models and read models being available and trustworthy.

## 7.1 Core tables Latch depends on
- `applications`
- `application_answers`
- `application_attachments`
- `resume_versions`
- `portal_sessions`
- `audit_events`
- related `jobs` metadata for context

## 7.2 Required read models

### Applying queue read model should expose
- application id
- job title/company
- portal domain
- completion percent
- missing required count
- low-confidence count
- selected tailored resume
- last activity timestamp
- current status

### Submit-review read model should expose
- application id
- portal launch URL
- structured answers summary
- attached resume metadata
- outstanding warnings
- recent activity timeline
- explicit review checklist state

### Application detail workspace should expose
- current lifecycle state
- selected base/tailored resume references
- answer inventory by group
- confidence and review-state breakdown
- attachment inventory
- portal-session summary
- blockers and warnings
- recent audit trail

## 8) Required API implications

Latch does not require direct database access from the browser. It depends on stable backend-for-frontend API surfaces.

### High-priority API support
- `GET /api/applications`
- `GET /api/applications/:applicationId`
- `POST /api/applications/:applicationId/pause`
- `POST /api/applications/:applicationId/resume`
- `POST /api/applications/:applicationId/move`
- `POST /api/applications/:applicationId/portal/open`
- `POST /api/applications/:applicationId/ready-for-submit-review`
- `POST /api/applications/:applicationId/mark-submitted`

### Additional API support Latch likely needs
- update/add structured answers
- attach/select resume artifact
- attach/remove non-resume files
- sync portal-session summary
- acknowledge or resolve warnings
- record blocker resolution

## 9) Readiness algorithm requirements

Latch needs a formal readiness policy for advancement into `submit_review`.

## 9.1 Minimum hard requirements
An application should not move to `submit_review` unless:
- a tailored resume is selected
- required attachments are present
- missing required fields are at or below the configured threshold
- no hard blockers remain

## 9.2 Additional recommended checks
- low-confidence answers are below a chosen threshold or explicitly accepted
- portal launch metadata exists
- no unresolved `blocked` review-state answers remain
- selected resume version matches intended job/application context
- latest portal sync, if present, is not stale beyond policy

## 9.3 Recommended readiness result shape
```json
{
  "ready": false,
  "hardBlockers": ["required_resume_missing"],
  "softWarnings": ["salary_expectation_low_confidence"],
  "missingRequiredCount": 2,
  "lowConfidenceCount": 1,
  "completionPercent": 82,
  "recommendedNextAction": "attach tailored resume and resolve blocked field"
}
```

## 10) UI surface requirements

Latch’s utility depends heavily on product surfaces that support disciplined review.

## 10.1 Applying workspace requirements
The Applying workspace should make it easy to:
- view completeness state
- inspect field groups and answer status
- identify missing required information
- inspect confidence and review-state markers
- verify selected attachments
- inspect portal metadata
- pause or resume work intentionally

## 10.2 Submit-review workspace requirements
The Submit Review workspace should make it easy to:
- inspect a final readiness summary
- review structured answers in human-readable form
- confirm attached resume metadata
- view warnings and blockers clearly
- open the real portal in a new tab/window
- confirm submission after Benny completes the real portal action

## 10.3 Design preference
The UI should favor checklists, grouped review surfaces, and obvious warnings over dense unstructured detail.

## 11) Security and safety requirements

### Principles
- keep credential/session capture minimal
- avoid storing sensitive portal secrets in audit payloads
- ensure all mutating actions occur in authenticated user context
- preserve the manual-submit boundary
- do not use stealth automation or challenge-evasion methods as a core design assumption

### Browser safety constraints
- use browser automation for inspection and assistance, not deceptive or opaque submission behavior
- keep evidence capture purposeful, not invasive
- do not treat screenshots as a substitute for the real portal during final review

## 12) Success criteria

Latch is successful if:
- incomplete applications are not falsely marked ready
- uncertainty is surfaced clearly and early
- missing or incorrect attachments are caught before final review
- low-confidence answers are visible and actionable
- Benny receives a clean final-review packet
- Benny retains final submit authority in the live external portal
- operational actions remain auditable

## 13) Failure modes to guard against

High-priority failure modes:
- wrong resume attached to wrong job
- required field silently missing
- guessed answer presented as certain
- move to `submit_review` too early
- portal state misread or treated as fresher than it is
- screenshots treated as authoritative instead of the live portal
- browser assistance crossing into forbidden auto-submit behavior

## 14) Phased implementation plan

## Phase A — Latch foundation
Build:
- application state guards
- readiness evaluator
- blocker/warning taxonomy
- answer confidence and review-state support
- attachment integrity checks
- audit hooks

Deliverable:
Applications can move through application states with disciplined readiness enforcement.

## Phase B — Applying workspace
Build:
- applying queue read model
- application detail workspace
- structured answer review/edit surfaces
- attachment manager
- readiness panel
- pause/resume flows

Deliverable:
Latch can operate the application-prep phase without guesswork.

## Phase C — Portal-session layer
Build:
- lightweight `portal_sessions` support
- open-portal flow
- session summary updates
- last-known-page and sync metadata
- notes and warnings integration

Deliverable:
The real external portal becomes an explicit tracked part of the workflow.

## Phase D — Browser-assisted inspection
Build:
- Playwright-backed portal inspection routines
- field discovery
- validation/error detection
- upload widget detection
- browser-to-answer mapping scaffolding
- portal-state summaries

Deliverable:
Latch can inspect real application portals and report readiness with stronger evidence.

## Phase E — Submit-review handoff
Build:
- submit-review read model
- final checklist UX
- open-real-portal CTA
- warning summary
- explicit post-submit confirmation flow

Deliverable:
Benny gets a disciplined, honest, final-review handoff instead of a vague “should be good.”

## 15) Final recommendation

Implement Latch as a **readiness-and-integrity operator** for applications, not as a generic autofill bot.

The highest-value backbone for v1 is:
- readiness rules
- blocker taxonomy
- confidence model
- attachment integrity controls
- portal-session tracking
- submit-review checklist and handoff

If these pieces are strong, later automation can be added safely without corrupting the human-review boundary or weakening operational trust.
