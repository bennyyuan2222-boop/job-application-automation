# Needle Migration Appendix

## Purpose

This appendix defines how Needle should evolve from a local, agent-driven MVP into the future hosted SQL-first Job Ops Console without forcing a redesign of the core tailoring model.

The goal is to preserve the right abstractions now, even if the first implementation is local and lightweight.

---

## 1. Strategic framing

Needle should be treated as:
- a truth-first fit assessment engine
- a truth-first resume tailoring engine
- a review-oriented resume revision subsystem

Needle should **not** be treated as:
- a pile of generated resume files
- a one-off CLI with no durable model
- a local-only architecture whose concepts do not survive into the hosted app

The local MVP exists to validate logic and workflows.
The hosted console is the long-term product surface.

---

## 2. Two implementation modes

## Mode A — Local MVP

Purpose:
- validate Benny's tailoring workflow quickly
- test truth constraints and fit logic
- integrate with the existing lead registry
- avoid overbuilding before the hosted console exists

Characteristics:
- local workspace files for canonical experience data
- local SQLite for Needle-specific metadata
- local vector store for retrieval
- adapter to read from lead-registry SQLite
- CLI / agent-driven usage
- markdown-first outputs
- minimal export support

## Mode B — Hosted Console Integration

Purpose:
- support the real long-term workflow across devices
- integrate with Inbox / Shortlist / Tailoring / Applying / Submit Review
- persist review history, version history, and auditability in SQL

Characteristics:
- Postgres canonical datastore
- API-driven reads/writes
- worker-based tailoring generation
- resume versions stored as text + structured sections
- artifacts stored in object storage
- UI-driven review and approval workflow

---

## 3. Stable product abstractions across both modes

These are the abstractions that should survive both implementations.

### 3.1 Canonical career truth base
A structured, editable representation of Benny's real experience.

This remains the source of truth for:
- roles
- projects
- skills
- achievements
- evidence strength
- prohibited claims

Local MVP implementation:
- YAML / JSON / Markdown

Hosted implementation:
- SQL-backed structured records, or SQL + imported structured source documents

### 3.2 Base resume concept
A small number of durable positioning variants.

This concept survives both modes.
The storage format changes, but the abstraction does not.

Examples:
- analytics
- business analyst
- product strategy
- AI-adjacent

### 3.3 Resume version
This should be the canonical abstraction for any reviewable resume text.

A resume version should always support:
- kind: base or tailored
- parent link
- canonical text content
- structured sections
- change summary
- source traceability

Local MVP:
- markdown files plus metadata rows

Hosted:
- `resume_versions` table plus artifact URLs

### 3.4 Tailoring run
A tailoring run is the unit of generation and review.

It should always capture:
- input/base resume version
- target job/application context
- output resume version
- fit rationale
- risk summary
- revision notes
- status

### 3.5 Job context
Tailoring should not depend on free-floating text forever.
It should target a job object with stable identity.

Local MVP:
- `lead_uid` from lead registry

Hosted:
- `job.id` and later `application.id`

### 3.6 Audit event
Every meaningful state change should be loggable.

Examples:
- fit assessed
- tailoring generated
- edits requested
- tailoring approved
- export generated

---

## 4. Transitional architecture

## 4.1 Current upstream reality

Today, job intake comes from:
- `/Users/clawbot/.openclaw/workspace-job-searcher/data/lead-registry/lead-registry.sqlite`

Useful upstream tables already exist:
- `leads`
- `lead_observations`
- `lead_status_history`
- `search_runs`
- `run_queries`

This database is a transitional upstream source, not Needle's long-term canonical datastore.

## 4.2 Transitional integration rule

Needle should:
- read from the lead registry
- normalize selected job records into Needle's assessment flow
- keep Needle-specific state in its own local store
- avoid mutating the upstream lead-registry schema

## 4.3 Long-term integration rule

Once the hosted console exists, Needle should stop depending on the lead-registry SQLite file directly.
Instead it should:
- read canonical jobs from Postgres-backed application services
- write tailored resume versions and tailoring runs into SQL
- emit audit events into the shared product audit trail

The lead-registry adapter should be replaceable.

---

## 5. Data model mapping

This section maps local MVP concepts to the future hosted SQL model.

| Local MVP concept | Transitional source/store | Hosted target model |
|---|---|---|
| Lead record | `lead_registry.leads` | `jobs` |
| Raw observation | `lead_registry.lead_observations` | `job_source_records` + `job_source_links` |
| Upstream fit hints | `scores_json`, `signals_json`, `risks_json` | `job_scorecards` and enrichment/explanation fields |
| Base resume file | local markdown + metadata | `resume_versions(kind='base')` |
| Tailored draft | ephemeral markdown / local metadata | `resume_versions(kind='tailored')` |
| Tailoring execution record | local `tailor_runs` table/file | `tailoring_runs` |
| Resume export | local PDF/DOCX file | object storage artifact + `application_attachments` |
| Job-specific fit assessment | local assessment rows | `job_scorecards` or app-specific fit/explanation model |
| Review activity | local log / metadata | `audit_events` |
| Active tailoring context | local lead + selected base resume | `applications` + `tailoring_runs` |

---

## 6. Workflow migration

## 6.1 Local MVP workflow

1. choose a `lead_uid`
2. load canonical lead summary and latest observations
3. select nearest base resume
4. assess fit against Benny's truth base
5. decide whether tailoring is needed
6. generate tailored draft if warranted
7. show diff + rationale
8. save only if approved

## 6.2 Hosted console workflow

1. job exists in Inbox / Shortlist as canonical `job`
2. Benny starts an `application`
3. base `resume_version` is attached
4. tailoring worker creates a `tailoring_run`
5. worker generates new `resume_version(kind='tailored')`
6. UI renders base vs tailored vs JD review workspace
7. Benny approves or requests edits
8. approved tailored resume flows into Applying / Submit Review

## 6.3 Migration principle

The local CLI flow should be designed so each major step already corresponds to a future hosted workflow step.

Avoid inventing local-only concepts that have no future home.

---

## 7. Changes required to Needle's implementation spec

The main spec should be interpreted with these adjustments:

### 7.1 Local persistence is temporary
Local YAML/SQLite/vector storage is an MVP implementation choice, not the final product data architecture.

### 7.2 Application context is the long-term unit of work
Even if the local MVP starts with `lead_uid`, the future unit of work is:
- job -> application -> tailoring run -> resume version review

### 7.3 Resume files are not the primary abstraction
The primary abstraction is `resume_version`.
Files are secondary export artifacts.

### 7.4 Tailoring must be review-oriented
Every tailoring operation should produce:
- changed sections
- rationale summary
- risk summary
- version lineage

This supports the future 3-column Tailoring workspace.

### 7.5 Upstream scores are priors, not truth
Any upstream scoring signals should remain advisory.
Needle's truth-first resume fit logic should stay independently defensible.

### 7.6 Auditability is first-class
Needle should generate event-friendly records now so future SQL audit history is straightforward.

---

## 8. Interface contracts Needle should preserve now

To make migration smooth, Needle should already produce structured outputs resembling future API payloads.

## 8.1 Assessment output contract

Suggested shape:

```json
{
  "job_ref": {
    "type": "lead_uid",
    "id": "lead_123"
  },
  "selected_base_resume": "analytics",
  "fit_score": 0.78,
  "fit_band": "light_tailor",
  "top_reasons": [
    "Strong analytics alignment",
    "Relevant stakeholder-facing work"
  ],
  "risk_flags": [
    "No direct people-management evidence"
  ],
  "unsupported_requirements": [
    "Tableau administration"
  ],
  "recommended_action": "light_tailor"
}
```

## 8.2 Tailoring output contract

Suggested shape:

```json
{
  "job_ref": {
    "type": "lead_uid",
    "id": "lead_123"
  },
  "input_resume_version_ref": "base_analytics_v1",
  "output_resume_version_ref": "tailored_tmp_001",
  "status": "generated",
  "change_summary": [
    "Rewrote summary for analytics emphasis",
    "Promoted cross-functional project bullets",
    "Removed less relevant technical detail"
  ],
  "rationale": [
    "JD emphasized stakeholder-facing analytics delivery",
    "Existing base resume underweighted reporting and business partnership work"
  ],
  "risk_summary": [
    "No direct people management claim added"
  ]
}
```

These can later map cleanly to API models and UI workspaces.

---

## 9. Recommended local MVP boundaries

To avoid wasted effort, the local MVP should include only what helps future migration.

Include:
- canonical truth base
- base resume variants
- lead-registry adapter
- fit assessment
- truthful tailoring
- diff/change summary
- traceability metadata
- lightweight local run history

Do not overinvest in:
- fancy local UI
- permanent export pipelines
- file-heavy storage conventions
- local concepts that do not map to `applications`, `resume_versions`, or `tailoring_runs`

---

## 10. Migration-ready build order

### Stage 1 — Local foundation
- canonical truth schema
- achievements / evidence schema
- base resume abstractions
- local fit assessor
- local truth policy

### Stage 2 — Transitional job integration
- lead-registry adapter
- `lead_uid`-based assessment flow
- upstream hints merged as priors

### Stage 3 — Review-oriented tailoring
- resume version abstraction
- tailoring run abstraction
- structured diff/change summaries
- save/approve semantics

### Stage 4 — Hosted-model alignment
- map local models to future SQL tables
- introduce API-shaped payloads
- isolate storage adapters

### Stage 5 — Hosted integration
- swap local adapters for Postgres/API-backed adapters
- write into hosted `applications`, `resume_versions`, `tailoring_runs`, and `audit_events`

---

## 11. Final recommendation

Needle should be built now as a local, truth-first tailoring engine.
But it should be shaped from day one to become the tailoring subsystem inside Benny's hosted Job Ops Console.

That means:
- stable abstractions now
- replaceable storage/integration adapters
- review-first outputs
- version-first resume modeling
- event-friendly records

If those rules hold, the transition from local MVP to hosted product should be additive rather than a rewrite.
