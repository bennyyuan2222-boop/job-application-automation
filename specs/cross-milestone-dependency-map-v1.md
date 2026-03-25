# Cross-Milestone Dependency Map v1

_Status: canonical planning doc_
_Last updated: 2026-03-25_

## Purpose

Show what must be built first, what can run in parallel, and what each milestone unlocks for the next one.

This doc is intentionally practical. It is not a philosophical roadmap; it is a dependency map for implementation sequencing.

## Related docs

- `specs/roadmap-milestones-v1.md`
- `specs/milestone-1-scout-automation-and-triage-v1.md`
- `specs/milestone-1-scout-implementation-checklist-v1.md`
- `specs/milestone-2-needle-tailoring-system-v1.md`
- `specs/milestone-3-latch-application-ops-v1.md`
- `specs/milestone-4-submit-review-and-recording-v1.md`
- `specs/milestone-5-browser-assisted-fill-v1.md`
- `specs/roadmap-engineering-v2.md`

## The short version

The real critical path is:

1. **Scout real ingestion + cron + run telemetry**
2. **Needle durable tailored artifact contract (markdown + PDF)**
3. **Latch structured answers + reusable profile answers + readiness**
4. **Submit Review packet freeze + dirty-state + submission recording**
5. **Browser-assisted fill on Greenhouse**

If any of these are skipped or done out of order, the later milestone becomes either fragile or fake.

---

## Hard dependency graph

```text
Repo-wide engineering conventions
  ├─> Milestone 1 (Scout automation + triage backbone)
  │      └─> unlocks real shortlisted jobs for downstream use
  ├─> Milestone 2 (Needle tailoring system)
  │      └─> unlocks approved tailored resume + PDF artifact
  ├─> Milestone 3 (Latch application ops)
  │      └─> unlocks structured answers + attachments + readiness
  ├─> Milestone 4 (Submit review + recording)
  │      └─> unlocks frozen final packet + submitted record
  └─> Milestone 5 (Browser-assisted fill)
         └─> depends heavily on M3 + M4, and partially on M2
```

### Hard milestone dependencies

- **Milestone 2 depends on Milestone 1**
  - because Scout must create real shortlisted jobs that move into application creation reliably

- **Milestone 3 depends on Milestone 2**
  - because Latch needs an approved tailored resume and a stable downstream artifact contract

- **Milestone 4 depends on Milestone 3**
  - because packet freeze and dirty-state are meaningless without structured answers, explicit attachments, and readiness semantics

- **Milestone 5 depends on Milestone 3 and Milestone 4**
  - because browser fill needs canonical application answers and attachments from M3
  - and it needs the human final-review boundary from M4 so it knows where to stop

---

## Repo-wide enabling foundations

These are not standalone milestones, but they affect every milestone after Phase 1.

### Foundation A — Service-boundary discipline

**Needed before:** Milestones 1-5  
**Why:** prevents long-running work from getting trapped in Next.js request handlers

Required shape:
- `apps/web` stays thin
- workers call service modules
- `packages/read-models` owns UI query logic
- `packages/contracts` owns DTO/schema contracts

### Foundation B — Protected internal route convention

**Needed before:** Milestones 1, 4, 5  
**Why:** cron/system/browser entrypoints should not masquerade as casual UI routes

Recommended convention:
- `app/api/internal/**` for protected system routes
- `app/api/actions/**` or server actions for UI/user-facing mutations

### Foundation C — Test scaffolding and fixtures

**Needed before:** deep Milestone 1 hardening, all later milestones  
**Why:** too much domain state is already present to keep flying without regression coverage

Minimum repo additions:
- `tests/fixtures/`
- `tests/integration/`
- unit/integration test runner conventions

### Foundation D — Object-storage artifact contract

**Needed before:** Milestone 2 exit, Milestone 5 start  
**Why:** PDF artifacts cannot remain “pretend files” forever if Latch and Browser Fill must upload them

Current note:
- the repo already models `renderedPdfUrl` on `ResumeVersion`
- current `app/api/resume-artifacts/[resumeVersionId]/route.ts` still returns markdown, not a real PDF artifact

### Foundation E — Audit/event taxonomy discipline

**Needed before:** all milestones  
**Why:** history, debugging, and human trust all depend on stable event names and payloads

---

## Critical path by phase gate

## Gate 1 — Make Scout real enough to feed the system

### Must land first
- JobSpy MCP adapter boundary
- Indeed first-source implementation
- OpenClaw/Gateway cron scheduling path
- run idempotency strategy
- run telemetry and partial-failure handling
- minimal run-ops UI
- optional heartbeat summary/watchdog path that reads recent runs rather than performing ingest

### Why this gate matters
Until this lands, the product is still downstreaming from demo/manual seed data more than from real discovery.

### Main hidden risk
**Gateway cron must execute on a host that reliably reaches JobSpy MCP, the shared repo entrypoint, and the shared DB without turning heartbeat into the actual ingest pipeline.**

### Unlocks
- real Inbox population
- real Shortlist creation
- trustworthy backlog for Needle work

---

## Gate 2 — Make Needle outputs durable, reviewable, and uploadable

### Must land next
- stable base-resume inventory
- fit assessment output
- tailored run history
- review loop (approve/request edits/pause)
- rendered PDF artifact path for approved tailored resumes

### Why this gate matters
Latch and Browser Fill need a concrete resume artifact contract.
Without it, "selected tailored resume" is just an idea.

### Unlocks
- approved tailored resume identity
- PDF attachment default for Latch
- trustworthy handoff from Tailoring -> Applying

---

## Gate 3 — Make Latch authoritative about readiness

### Must land next
- `profile_answers`
- field-level `application_answers`
- explicit `application_attachments`
- readiness rules with blockers/warnings
- portal session summary model
- Applying queue and detail workspace

### Why this gate matters
This is where the system becomes operational instead of just descriptive.

### Unlocks
- human can see what is missing
- browser fill has canonical answers to use
- submit review can freeze a real packet

---

## Gate 4 — Make the final-review boundary explicit

### Must land next
- packet freeze/snapshot contract
- dirty-state detection after review freeze
- manual submission confirmation flow
- submission recording entity or durable equivalent

### Why this gate matters
Without this gate, browser fill either stops in an ambiguous place or pushes too far.

### Unlocks
- trustworthy stop-before-submit boundary
- durable submitted record
- reliable reopen/re-review behavior

---

## Gate 5 — Add browser assistance carefully

### Must land last
- fake form harness
- Greenhouse adapter
- field inspection and mapping
- safe fill primitives
- PDF upload path
- evidence/logging
- review-ready handoff

### Why this gate matters
Browser automation is only safe once the product knows:
- what the right answers are
- what the correct resume is
- what the final human boundary is

---

## Dependency table by milestone

| Milestone | Hard inputs required | Main outputs produced | Blocks if missing |
|---|---|---|---|
| M1 Scout | repo conventions, DB migrations, cron protection, adapter transport | real jobs, provenance, scorecards, shortlistable queue | M2 lacks trustworthy real pipeline input |
| M2 Needle | shortlisted jobs, resume inventory, artifact path strategy | tailored runs, selected base logic, approved tailored resume + PDF | M3 lacks stable resume artifact contract |
| M3 Latch | approved tailored resume, application lifecycle, readiness engine | profile answers, application answers, attachments, applying queue | M4 cannot freeze a real packet; M5 lacks canonical answers |
| M4 Submit Review | M3 packet semantics, portal URL/session tracking | frozen packet, dirty-state, manual submission record | M5 lacks clean stopping boundary |
| M5 Browser Fill | M3 canonical answers/attachments, M4 final-review boundary, harness | inspected/filled portal sessions, uploaded PDF, review-ready live page | live automation becomes unsafe or misleading |

---

## Parallelization map

Not everything has to be serialized. Some work can run in parallel if the boundaries are clear.

## Safe parallel track A — Repo-wide technical cleanup

Can run in parallel with late Milestone 1 work:
- move Scout/Needle/Latch read queries into `packages/read-models`
- standardize DTOs in `packages/contracts`
- introduce testing directory structure
- standardize internal-route conventions

## Safe parallel track B — Artifact infrastructure

Can run in parallel with Milestone 2 build-out:
- object storage wiring for resume PDFs
- PDF render strategy proof-of-concept
- signed URL or proxy delivery design

## Safe parallel track C — Latch model prep

Can begin while Milestone 2 UI polish is still finishing:
- `profile_answers` schema draft
- answer field taxonomy
- attachment semantics
- portal session enum expansion

## Safe parallel track D — Browser harness prep

Can begin before the full Milestone 5 implementation:
- fake Greenhouse-like forms
- form classification test cases
- ATS capability matrix doc

### What should **not** be parallelized too aggressively

- real browser fill before M3 readiness semantics settle
- PDF upload automation before the resume artifact contract is real
- submit-review UX before packet-freeze semantics are agreed
- broad ATS support before one Greenhouse path works end-to-end

---

## Current repo-based blockers to track explicitly

### Blocker 1 — `workers/latch` implementation is still missing
The repo has Scout and Needle worker code, but not a real Latch worker package/service yet.

Impact:
- M3/M4/M5 orchestration risks drifting into web routes unless a real Latch boundary is created

### Blocker 2 — `packages/read-models` is underused
The package exists, but much of the queue/read logic still lives in `apps/web/lib/queries.ts`.

Impact:
- increasing coupling between UI layer and DB details

### Blocker 3 — no real `tests/` tree yet
Architecture docs expect tests, but the repo currently lacks a concrete test directory.

Impact:
- regression risk rises with every new state transition and worker feature

### Blocker 4 — current resume artifact route is markdown-only
`app/api/resume-artifacts/[resumeVersionId]/route.ts` still serves markdown instead of a real PDF artifact.

Impact:
- M2/M3/M5 could falsely assume real uploadable resume files exist when they do not

### Blocker 5 — Scout fetch path is sample/manual, not scheduled-real
Current Scout works on injected records, not on a true JobSpy MCP fetch path.

Impact:
- M1 is not truly done yet

---

## Recommended execution order

## Sequence 1 — Finish the real top-of-funnel
1. M1 schema + worker + adapter + cron
2. M1 run-ops surface + tests

## Sequence 2 — Lock the tailored artifact contract
3. M2 fit assessment + base selection
4. M2 PDF render + approval handoff

## Sequence 3 — Make applying operational
5. M3 reusable profile answers + field-level answers
6. M3 readiness + attachments + portal session summaries

## Sequence 4 — Productize final review
7. M4 packet freeze + dirty-state
8. M4 manual submission recording

## Sequence 5 — Add live browser assistance
9. M5 Greenhouse inspection harness
10. M5 Greenhouse fill + PDF upload + review-ready handoff

---

## Recommended milestone exit rules

### Do not exit M1 until:
- cron path exists
- real adapter path exists
- reruns are safe
- run telemetry is visible

### Do not exit M2 until:
- approved tailored resume has a durable PDF artifact
- approval creates a trustworthy downstream attachment pointer

### Do not exit M3 until:
- reusable profile answers exist
- readiness explains blockers clearly
- Applying queue is trustworthy

### Do not exit M4 until:
- reviewed packet can be frozen
- stale review can be detected
- submission confirmation is durable

### Do not exit M5 until:
- Greenhouse works end-to-end up to review boundary
- upload uses the selected tailored PDF artifact
- unsupported fields are surfaced safely
- final submit remains human-only

---

## Final recommendation

If sequencing discipline slips, the first place the system will start lying is Browser Fill.
So keep this order strict:

**real jobs -> real tailored artifact -> real readiness -> real final review -> real browser assistance**

That order is the difference between a product that helps Benny apply and a product that merely looks busy.
