# Latch Agent Contract v1

_Status: proposed implementation contract for Milestone 3_
_Last updated: 2026-04-07_

## Purpose

Define the real Latch agent boundary for Milestone 3 so the application-ops lane has a crisp contract before async topology work expands around it.

This doc is intentionally narrower than the full milestone spec. It locks:
- the real runtime boundary
- the first task intent
- the entry point from Needle into Applying
- answer review defaults
- readiness and failure semantics for the first Latch slice

Companion docs:
- `specs/milestone-3-latch-application-ops-v1.md`
- `specs/phase-6-async-needle-worker-topology.md`
- `specs/milestone-4-submit-review-and-recording-v1.md`

## Locked defaults

These defaults are now the recommended v1 contract unless Benny changes them explicitly.

- Lane/product name: `Latch`
- Real OpenClaw agent id: `application-ops`
- Runtime boundary kind: `openclaw_agent`
- First task intent: `prepare_application_workspace`
- Entry point: after approved Needle handoff from `tailoring_review` into `applying`
- Inferred answer default review state: `needs_review`
- Live browser fill in this slice: disabled
- Final human review and submit boundary: required and preserved

## Why this contract exists

Latch should not look like a fake lane implemented by a local helper script that happens to mutate DB state.

For Milestone 3, the boundary is explicit:
- Vercel or server actions may enqueue or request Latch work
- canonical state remains in Postgres/object storage/audit events
- the real execution lane is the OpenClaw agent `application-ops`
- the agent returns structured readiness/output data back into canonical state

If a local script is used during scaffolding, it should be treated as a temporary worker implementation detail, not the product boundary.

## Milestone 3 slice boundary

### Starts when

Latch starts only after all of the following are true:
- Needle has produced a tailored draft
- Benny has approved the tailored output for downstream use
- the application has crossed from `tailoring_review` into `applying`
- a selected tailored resume version exists for the application

### Does not include yet

This slice does **not** include:
- live browser form filling
- ATS-specific adapters
- automatic submit
- replacing Benny's final live portal review
- replacing Benny's final submit click

## Required entry contract

The first request into Latch should carry, directly or indirectly through canonical DB state, these facts:
- `applicationId`
- `jobId`
- approved Needle handoff metadata
- approved tailored resume version id
- actor/time of approval
- confirmation that the runtime target is the real OpenClaw agent `application-ops`
- policy snapshot showing Milestone 3 safety constraints

The minimum trigger source is:
- `needle_approved_handoff`

The minimum status transition in scope is:
- `tailoring_review` -> `applying`

## First task intent

### Intent

`prepare_application_workspace`

### What this intent is allowed to do

- hydrate or reconcile structured application answers
- seed answers from reusable profile answers
- mark inferred answers as `needs_review`
- register provenance for answers/attachments
- verify tailored resume selection vs attached resume artifact
- compute readiness summary, blockers, warnings, and next action
- register lightweight portal session context if it already exists
- emit auditable output for downstream UI/worker consumption

### What this intent is not allowed to do

- perform live browser fill
- submit an application
- silently mark inferred answers as accepted just because confidence is high
- erase the human final review boundary

## Answer policy

### Review states

Latch uses three answer review states:
- `accepted` — trusted for downstream use, usually after human review or explicit trusted source selection
- `needs_review` — usable as a draft/inference, but must be checked before final handoff
- `blocked` — do not use until resolved by a human or a policy-clearing operation

### Default rule for inferred answers

If Latch infers, derives, copies, or proposes an answer from:
- a resume
- a reusable profile answer
- another application
- agent reasoning
- portal detection

then the default review state is:
- `needs_review`

This stays true even when confidence is high.

Confidence helps prioritize review. Confidence does **not** auto-promote an inferred answer to `accepted` in Milestone 3.

### Provenance requirement

Each answer produced or touched by Latch should preserve enough provenance to explain:
- where the answer came from
- whether it was copied, inferred, or manually entered
- which source record or artifact supported it
- why it still needs review, if applicable

## Readiness policy

### Hard blockers

These should prevent advancement into `submit_review` in Milestone 3:
- tailored resume missing
- resume attachment missing
- attached resume mismatches selected tailored resume
- required answers missing
- blocked answers present

### Soft warnings

These should remain visible but not automatically hard-block unless policy changes later:
- answers pending review
- low-confidence answers present
- portal session missing
- portal session not ready

### Recommended next action

The readiness payload should always return the clearest single next action, such as:
- select tailored resume
- attach matching resume artifact
- complete missing required answers
- resolve blocked answers
- review inferred answers
- register portal session
- hand off to Benny for final review

## Response contract

The first Latch agent response should report:
- contract version
- lane name
- boundary kind + agent id
- intent
- task status (`completed`, `blocked`, or `failed`)
- readiness snapshot
- prepared answer payloads with provenance and review state
- selected resume vs attached resume state
- portal tracking summary
- explicit `browserAutomation.attempted = false`
- explicit human final review / submit requirements
- failure payload when applicable

## Failure semantics

Use these meanings consistently:

- `completed` — the agent finished the Milestone 3 preparation pass and returned a valid workspace/readiness result
- `blocked` — the agent completed evaluation but policy/data blockers prevent a ready handoff
- `failed` — the agent could not complete the task because of runtime, contract, or unexpected internal failure

Recommended failure codes for the first slice:
- `needle_handoff_missing`
- `application_not_in_applying`
- `tailored_resume_missing`
- `resume_attachment_mismatch`
- `required_answers_missing`
- `blocked_answers_present`
- `policy_violation_browser_fill_not_allowed`
- `invalid_latch_contract`
- `internal_error`

## Human boundary

Latch may prepare and evaluate.
Latch may not collapse the final human boundary.

Milestone 3 must preserve both of these facts in the contract:
- Benny performs the real final review on the live application surface
- Benny performs the real final submit click

## Canonical schema hooks

Typed schemas for this contract should live in:
- `packages/contracts/src/latch.ts`

The main shapes are:
- `latchTaskRequestSchema`
- `latchAgentResponseSchema`
- `latchPreparedAnswerSchema`
- `latchReadinessSnapshotSchema`
- `latchReviewPolicySchema`

## Implementation checklist for the next coding pass

1. Wire the async topology lane so the real OpenClaw agent id `application-ops` is the execution target.
2. Persist a Latch task/request record using the contract payload from the approved Needle handoff.
3. Make the worker/runtime write back the typed Latch response shape.
4. Reconcile response fields into canonical `application_answers`, `application_attachments`, `portal_sessions`, and readiness caches.
5. Emit audit events that preserve provenance and policy outcomes.
6. Keep `browserAutomation.attempted = false` for this milestone slice.
7. Gate movement into `submit_review` from readiness, not from implicit worker success.

## Non-goals for this contract doc

This doc does not define:
- browser automation commands
- Greenhouse or other ATS field adapters
- submit recording mechanics beyond preserving the human boundary
- queue implementation details for the worker runtime
