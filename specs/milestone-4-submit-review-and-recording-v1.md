# Milestone 4 — Submit Review and Submission Recording v1

_Status: canonical milestone spec_
_Last updated: 2026-03-25_

## Purpose

Make the human final-review boundary explicit and durable.

By the end of this milestone, the system should not merely say “ready.”
It should support a real final review step where Benny can:
- inspect the actual packet that is about to be submitted
- open the live application URL
- verify that the information looks right
- confirm submission manually
- record what happened in a way that survives memory lapses and session resets

## Primary user outcome

Benny should be able to treat Submit Review as the final staging area before the real click.
The system should make it obvious:
- what exactly is being submitted
- whether that packet changed since it was marked ready
- which portal URL to review
- how to record submission once done

## In scope

### 1. Submit Review queue
Build or harden a dedicated queue for applications in the final human review stage.

Each queue item should expose:
- job/company
- status
- readiness completion summary
- selected tailored resume
- portal domain / application URL availability
- whether the packet is frozen and still clean
- whether the application is already submitted

### 2. Final packet snapshot
When an application enters `submit_review`, the system should create a durable snapshot of the packet that is being reviewed.

The snapshot should capture at least:
- selected resume version id
- attachment set
- structured answers set
- portal URL / domain
- readiness summary at freeze time
- timestamp

This snapshot can be stored either:
- as explicit versioned DB records, or
- as a snapshot JSON structure attached to a review/submission entity

The important part is that later changes can be detected relative to what was reviewed.

### 3. Dirty-state / re-review detection
If the packet changes after entering Submit Review, the system should flag that prior review is stale.

Examples of packet-changing edits:
- selected tailored resume changed
- attachment set changed
- required answer changed
- portal URL changed materially

### 4. Final review workspace
The Submit Review detail experience should make it easy to verify:
- selected resume and attachments
- structured answers summary
- portal URL
- recent changes since readiness
- whether packet is unchanged since review freeze

### 5. Manual submission confirmation flow
After Benny submits in the live portal, the system must support explicit recording.

Required fields for confirmation flow:
- submitted timestamp
- portal URL/domain
- confirmation note or freeform summary
- optional external application id / reference number
- optional evidence pointer (screenshot, copied confirmation text, etc.)

### 6. Status transitions and reopening
Required transitions:
- `applying` -> `submit_review`
- `submit_review` -> `applying` if issues are found
- `submit_review` -> `submitted` on manual confirmation

Strongly recommended future-compatible transitions:
- `submitted` -> `withdrawn`
- `submitted` -> `rejected`

## Strongly recommended additions

### A. Submission packet identity / checksum
Introduce a packet fingerprint/hash so it is easy to know whether the reviewed packet still matches the current one.

### B. Final checklist model
Create a lightweight checklist for final review.

Suggested checklist items:
- correct resume selected
- required answers complete
- no blocked answers
- portal URL verified
- submit remains human-only

### C. Submission record entity
Consider introducing a first-class `submission_records` style entity rather than relying only on fields on `applications`.

This would make it easier later to store:
- confirmation text
- external ids
- evidence pointers
- submit actor / method
- multiple attempts or corrections if needed

## Out of scope

Do not build in this milestone:
- automatic portal submission
- aggressive browser automation
- follow-up workflow automation after submission
- broad reporting dashboards for every downstream outcome

## Domain and schema requirements

### Required canonical records
- `applications`
- `application_answers`
- `application_attachments`
- `portal_sessions`
- `audit_events`

### Recommended additions / fields

#### On `applications`
Recommended fields if a separate submission entity is not introduced yet:
- `submittedAt`
- `submissionMethod` (`manual`, `assisted_browser`, `unknown`)
- `externalApplicationId` or reference field
- `submitReviewFrozenAt`
- `submitReviewPacketHash`
- `submitReviewDirtyAt` if packet became stale

#### Optional `submission_records`
Suggested fields:
- application id
- submitted at
- submit actor label
- method
- portal URL/domain snapshot
- external reference number
- confirmation text/notes
- evidence URL/pointer
- packet snapshot or packet hash

## UX requirements

### Submit Review queue
Each queue item should communicate:
- whether the packet is currently clean or stale
- whether human review is complete
- whether submitted confirmation exists
- whether hard blockers somehow reappeared

### Submit Review detail page
The detail experience should expose:
- frozen packet summary
- current packet summary
- diff or “changed since freeze” indicator
- launch/open portal link
- recent audit trail
- manual submission confirmation form
- return-to-applying control

### Manual confirmation ergonomics
The confirmation flow should not be burdensome, but it should capture enough to be useful later.

At minimum Benny should be able to record:
- “I submitted this”
- when
- where
- any reference code or note

## Recommended build order

1. **Define packet-freeze contract**
   - what exactly counts as the final packet?
   - how will snapshot/fingerprint be represented?

2. **Implement dirty-state detection**
   - compute whether current packet differs from reviewed packet
   - surface stale review clearly

3. **Build or harden Submit Review read model**
   - queue summaries
   - status and packet freshness indicators

4. **Build final review detail surface**
   - frozen packet view
   - current packet view
   - open portal link
   - audit history

5. **Implement manual submission confirmation flow**
   - form/input handling
   - `submitted` transition
   - confirmation metadata storage

6. **Implement reopen flow**
   - send stale/problematic applications back to `applying`
   - require re-review after packet-changing edits

7. **Add evidence pointers if light enough**
   - optional but recommended for traceability

## Acceptance criteria

The milestone is complete when all of the following are true:

### Final-review boundary
- applications can enter a real `submit_review` stage only after readiness gates pass
- a packet snapshot or equivalent frozen review representation exists
- later changes to the packet can be detected and surfaced

### Review UX
- Benny can open the actual portal/application URL from the app
- the review page clearly shows what is about to be submitted
- the UI distinguishes clean review state from stale review state

### Recording
- Benny can mark an application submitted through an explicit confirmation flow
- submission metadata is stored durably
- the audit trail reflects the final confirmation action

### Reopen safety
- Benny can return an application to `applying` when issues are found
- packet-changing edits after freeze cause the need for re-review rather than silent drift

## Test plan

### Unit tests
Add/extend tests for:
- packet snapshot hashing/fingerprinting
- dirty-state detection
- application transitions around `submit_review` and `submitted`
- confirmation payload validation

### Integration tests
With a test DB, verify:
- a ready application can enter `submit_review`
- entering `submit_review` stores packet-freeze metadata
- changing an answer/attachment after freeze marks the packet stale
- manual confirmation marks application `submitted`
- submission reference/note is stored correctly
- returning to `applying` preserves prior review/submission history where appropriate

### Manual smoke checklist
- prepare a ready application
- move it to Submit Review
- inspect frozen packet summary
- change one answer and confirm stale flag appears
- return to Applying
- fix/re-freeze
- open portal URL
- mark submitted with note/reference id
- confirm submitted queue state and audit trail

## Best technical practices

### Treat the reviewed packet as a product object
Do not rely on memory or an implied state.

### Never auto-mark submitted from inference alone
A portal session looking “done” is not enough unless there is explicit confirmation logic.

### Preserve immutable history
A final submission event should remain visible even if other fields change later.

### Keep manual confirmation lightweight but structured
Freeform notes are useful, but at least a few typed fields should be stable/queryable.

### Surface stale review loudly
If the packet changed after review freeze, the UI should not quietly pretend it is still ready.

### Distinguish packet state from portal state
A clean internal packet does not necessarily mean the portal is fully correct, and vice versa.

### Keep the human boundary honest
This milestone is where the system proves it supports Benny rather than trying to replace Benny’s final judgment.

## Common failure modes to design for

- an application was “ready” yesterday but changed today without obvious UI signal
- Benny submits successfully but forgets to record it
- the wrong tailored resume was reviewed due to a late packet change
- the system marks submitted without capturing enough confirmation detail to trust the record later
- a stale packet remains in Submit Review and causes confusion

## Open questions

1. Should a first-class `submission_records` entity be introduced now or deferred until after Milestone 5?
2. What minimum evidence should be captured on manual submission: note only, reference id, screenshot pointer, or copied confirmation text?
3. Which packet fields should count as review-invalidating changes for v1?
4. Do we want a formal checklist model, or is snapshot + audit + dirty-state enough initially?
5. Should submitted applications remain editable at all, or mostly become historical records after confirmation?
