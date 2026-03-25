# Job Ops Console Roadmap Milestones v1

_Status: canonical planning doc_
_Last updated: 2026-03-25_

## Purpose

Translate the target Job Ops workflow into a milestone-based implementation plan that is concrete enough to build against.

This doc is the roadmap index. It points to the detailed milestone specs and defines the sequencing rules that should stay stable even if the implementation details evolve.

## Canonical target workflow

The intended end-state workflow is:

1. Scout ingests jobs on a schedule.
2. Benny reviews and shortlists good opportunities.
3. Needle assesses shortlisted jobs against resume truth and generates tailored drafts.
4. Benny reviews and approves the tailored resume.
5. Latch prepares the application packet, structured answers, and attachment state.
6. Latch fills supported form fields and uploads the correct resume in the live portal.
7. Benny performs the real final review on the actual application URL.
8. Benny clicks submit.
9. The system records the submission and preserves the relevant audit trail.

## Relationship to existing docs

Foundation / already-built baseline:
- `specs/shared-architecture-v1.md`
- `specs/phase-1-implementation-checklist-v1.md`
- `specs/deployment-vercel-neon-checklist-v1.md`

Earlier concise lane docs:
- `specs/scout-implementation-spec-v1.md`
- `specs/needle-implementation-spec-v1.md`
- `specs/latch-implementation-spec-v1.md`

Detailed roadmap docs introduced by this milestone pack:
- `specs/milestone-1-scout-automation-and-triage-v1.md`
- `specs/milestone-2-needle-tailoring-system-v1.md`
- `specs/milestone-3-latch-application-ops-v1.md`
- `specs/milestone-4-submit-review-and-recording-v1.md`
- `specs/milestone-5-browser-assisted-fill-v1.md`

## Milestone summary

### Milestone 0 — Shared backbone
Phases: 0-1  
Status: implemented baseline

Outcome:
- shared repo outside agent workspaces
- authenticated web app shell
- canonical Postgres schema baseline
- application/job state model
- audit trail
- seeded vertical slice

This milestone is already covered by the Phase 1 docs and does not need a separate new spec here.

### Milestone 1 — Scout automation and triage backbone
Primary outcome:
- jobs arrive automatically and land in canonical DB-backed Inbox/Shortlist queues with provenance, dedupe, and scoring

Detailed doc:
- `specs/milestone-1-scout-automation-and-triage-v1.md`

### Milestone 2 — Needle tailoring system
Primary outcome:
- shortlisted jobs produce truthful, reviewable tailored resume drafts with lineage, rationale, and approval flow

Detailed doc:
- `specs/milestone-2-needle-tailoring-system-v1.md`

### Milestone 3 — Latch application operations
Primary outcome:
- approved resume + structured answers + attachments become a real operational application workspace with explainable readiness

Detailed doc:
- `specs/milestone-3-latch-application-ops-v1.md`

### Milestone 4 — Submit review and submission recording
Primary outcome:
- final human review boundary becomes explicit, with packet freezing, submission confirmation, and durable recording

Detailed doc:
- `specs/milestone-4-submit-review-and-recording-v1.md`

### Milestone 5 — Browser-assisted portal fill
Primary outcome:
- Latch can fill supported live portals up to, but not including, the final submit click

Detailed doc:
- `specs/milestone-5-browser-assisted-fill-v1.md`

## Required sequencing rules

These rules are more important than the exact implementation order inside any single milestone.

### 1. Durable state before automation
Do not let browser automation become the source of truth.

The source of truth remains:
- PostgreSQL for structured product state
- object storage for binary artifacts
- audit events for history

### 2. Human submit boundary remains real
The system may prepare, inspect, and fill.
It must not silently replace Benny’s final submit review.

### 3. Worker/runtime work should move out of request handlers
Short synchronous demo flows are acceptable during scaffolding.
Real ingestion, tailoring generation, readiness recalculation, and browser work should migrate into workers or background tasks rather than depending on long web request lifecycles.

### 4. Every lane needs a visible handoff contract
Each lane must produce a clean artifact for the next lane:
- Scout -> canonical job + scorecard + provenance
- Needle -> approved tailored resume + rationale + risk summary
- Latch -> ready-to-review application packet + blocker/warning summary
- Submit Review -> frozen packet + manual confirmation + submitted record
- Browser Fill -> evidence-backed portal session state + form completion status

### 5. Auditability beats cleverness
Every meaningful user, agent, and system action should leave an auditable trace.
If a workflow is hard to explain after the fact, it is not ready.

## Cross-cutting engineering rules

These apply to all milestone implementations.

### Canonical state rules
- Do not use JSONL/markdown files as runtime truth.
- Preserve provenance when importing or transforming external data.
- Prefer append-only event/history records for source and submission evidence.
- Keep object/binary artifacts out of the relational DB body when possible; store references instead.

### State-machine rules
- All queue/status transitions must be explicit and testable.
- Invalid transitions should fail loudly.
- “Magic” implicit transitions should be avoided.
- When human review is required, represent that explicitly in state.

### Background work rules
- Support idempotency for all scheduled or retryable work.
- Long-running or flaky operations should be resumable.
- Partial failure should degrade gracefully and preserve useful diagnostics.
- One failed record should not poison an entire batch unless the failure is global.

### Observability rules
- Every milestone should add structured audit events.
- Worker runs should record counts, timings, and error summaries.
- Manual overrides should be visible, not hidden inside state blobs.
- Ops-facing debugging views are preferable to shell-only troubleshooting.

### Testing rules
- Unit-test domain rules and transformation logic.
- Integration-test DB mutations and queue handoffs.
- Add at least one realistic fixture set per lane.
- Browser automation must have a fake/sandbox harness before hitting real portals.

### Safety rules
- Never auto-submit applications.
- Do not store credentials in repo files or source-controlled specs.
- Keep secrets/env-driven configuration outside the codebase.
- Preserve human visibility for anything that could affect external application state.

## Recommended global build sequence

1. Finish Milestone 1 enough that real jobs enter the system automatically.
2. Finish Milestone 2 enough that a shortlisted job reliably becomes a reviewable tailored draft.
3. Finish Milestone 3 enough that an approved resume becomes a disciplined application workspace.
4. Finish Milestone 4 enough that the human submit boundary and submission record are real.
5. Finish Milestone 5 only after the packet/state model is reliable.

## Locked product decisions (2026-03-25)

These product decisions are now fixed for v1 planning unless Benny explicitly changes them.

1. **Scout v1 source strategy**
   - Use a JobSpy MCP-backed Scout ingestion path.
   - Prioritize Indeed as the first real source.
   - Use Benny's `job-search-spec.md` as the human preference source, but start the active v1 Scout profile narrowly: `Data Analyst` in `New York City`.
   - Keep the Scout adapter contract provider-extensible so later sources can plug in without redesigning the canonical ingestion layer.

2. **Browser Fill ATS priority**
   - Support Greenhouse first for real browser-assisted fill.
   - Keep the browser automation architecture capability-based and adapter-friendly so later ATS families can be added without overfitting everything to Greenhouse.

3. **Canonical tailored resume artifacts**
   - Treat markdown/structured content as the canonical textual representation.
   - Require a rendered PDF artifact for downstream use.
   - Do not make DOCX part of the v1 contract.

4. **Reusable answers in Latch**
   - Profile-level reusable answers are part of Milestone 3 exit criteria, not a stretch goal.
   - Application answers should support linkage or copy-from behavior from reusable profile answers.

5. **Scheduled job runtime**
   - Use OpenClaw cron on Gateway as the v1 scheduling runtime for Scout so scheduled runs execute on the machine that already has JobSpy MCP access.
   - Initial schedule: weekdays at `8:00 AM America/New_York`, plus a Sunday `6:00 PM America/New_York` backfill run.
   - Do not rely on heartbeat for Scout in v1; heartbeat-based monitoring/summary can remain disabled until the scheduled ingest path is stable.
   - Keep internal service boundaries clean enough that the scheduler can later move or add Vercel cron without rewriting Scout business logic.

## Remaining open questions

1. What minimum run-ops surface is enough before moving from Scout hardening to Needle hardening?
2. How explicit should unsupported-claim detection become in Needle v1: heuristic warnings or stronger evidence mapping?
3. What minimum evidence should Browser Fill capture per run: structured field summary only, screenshots, or both?
4. Should Milestone 4 introduce a first-class `submission_records` entity, or keep submission metadata on `applications` for the first pass?
5. When Scout expands beyond the first narrow profile, should multi-profile search configuration live in DB, repo config, or app-managed settings?

## Exit condition for roadmap v1

This roadmap is good enough when:
- every milestone has a clear scope boundary
- every milestone has explicit acceptance criteria
- every milestone has a recommended build order
- every milestone has a concrete testing strategy
- the milestone sequence clearly converges on the target workflow
