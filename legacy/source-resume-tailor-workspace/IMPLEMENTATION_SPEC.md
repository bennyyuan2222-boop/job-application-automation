# Needle Resume Tailor — Implementation Spec

## 1. Purpose

Needle is a truth-first resume tailoring agent for Benny.

Its job is to:
- maintain a canonical, structured record of Benny's real experience
- compare incoming job descriptions against that record and against existing resume variants
- decide whether tailoring is necessary
- generate tailored resumes only when the gain is meaningful
- ensure every claim remains true, defensible, and traceable to real source material
- avoid storing large numbers of one-off resume files by default
- evolve cleanly from a local MVP into the tailoring subsystem of Benny's future hosted Job Ops Console

## 2. Product Principles

### Non-negotiables
- No fake experience
- No invented metrics
- No invented tools or domains
- No false ownership claims
- No keyword stuffing that harms credibility

### System behavior
- Prefer reuse of an existing base resume when fit is already strong
- Tailor only when the JD materially differs from the best available base resume
- Keep retrieval separate from truth: the vector store helps find evidence, but the canonical profile is the source of truth
- Model resumes as versioned reviewable artifacts, not just loose files
- Treat local file storage as an MVP implementation detail, not the long-term product contract
- Design outputs, state, and identifiers so they can later map into hosted SQL models such as jobs, applications, resume_versions, tailoring_runs, and audit_events

## 3. Functional Requirements

### FR-0: Migration-safe architecture
The implementation must distinguish between:
- a local MVP persistence model used for fast iteration
- a hosted target architecture aligned with the future Job Ops Console

The MVP may use local files, SQLite, and a local vector store.
The long-term architecture should map cleanly to hosted SQL-backed concepts such as:
- `jobs`
- `applications`
- `resume_versions`
- `tailoring_runs`
- `audit_events`

### FR-1: Canonical profile store
The system must maintain a structured, editable record of:
- identity / contact basics
- roles
- companies
- employment dates
- responsibilities
- accomplishments
- projects
- technologies
- domain exposure
- leadership scope
- quantified outcomes
- evidence strength
- prohibited / weak claims

### FR-2: Resume variant library
The system must support a small set of base resumes, typically 3-6 variants.
Each variant should represent a coherent positioning lane, for example:
- backend / infrastructure
- AI / ML
- product / strategy
- founder / generalist
- analytics / data
- leadership / management

### FR-3: Job description ingestion
The system must parse a JD into structured dimensions:
- title
- seniority
- responsibilities
- required skills
- preferred skills
- tools / platforms
- domain / industry
- leadership requirements
- location / visa / work mode constraints if relevant

Primary source should be the upstream lead registry SQLite database when available, not ad hoc pasted text alone.
Needle should support both:
- direct JD input from paste / file / URL
- canonical lead ingestion from the job-searcher lead registry

### FR-4: Fit assessment
The system must score the JD against:
- canonical profile facts
- stored bullet-level evidence
- base resume variants

It must classify the opportunity into one of four actions:
- use existing base resume
- light tailoring
- full truthful tailoring
- caution / reject as poor fit

The fit system should be split conceptually into:
- pre-application job fit assessment used for prioritization and triage
- tailoring-level assessment used to decide resume adaptation and review behavior

### FR-5: Truth-constrained generation
The tailoring engine must only generate claims supported by:
- verified canonical facts
- explicitly marked supported inferences

Unsupported or weakly supported requirements must be:
- omitted
- softened
- or flagged for user review

### FR-6: Resume version model
The system must model resumes as versioned review artifacts.
Each resume version should support at minimum:
- kind (`base` or `tailored`)
- parent link where relevant
- canonical text content
- structured sections for stable diffing
- change summary
- traceability to source achievements/facts

### FR-7: Tailoring run model
Each tailoring execution must produce a first-class run record containing:
- input/base resume version reference
- target job reference
- future-compatible application reference when available
- output resume version reference
- fit rationale
- risk summary
- revision note if any
- status

### FR-8: Output retention policy
For the local MVP, the default exported-file mode should be ephemeral.
Generated PDFs/DOCXs should not be automatically saved unless:
- user explicitly approves saving
- user explicitly requests export
- a configured retention rule says otherwise

However, the long-term abstraction should allow meaningful resume text versions and tailoring runs to persist without requiring file sprawl.

### FR-9: Explainability
Each tailoring run must produce:
- chosen base resume
- fit score
- reasons tailoring was or was not needed
- unsupported / risky JD requirements
- changed sections / bullets
- version lineage
- save / discard or approval state

### FR-10: Auditability events
The system must record event-friendly state changes for actions such as:
- fit assessed
- tailoring generated
- tailoring edit requested
- tailoring approved
- resume exported

## 4. Non-Functional Requirements

### NFR-1: Local-first MVP, hosted-compatible design
The system should run locally in the workspace for the MVP and keep sensitive resume data on disk unless Benny asks for cloud services.
The design should still preserve a clean migration path to a hosted SQL-first implementation.

### NFR-2: Editable by hand
Canonical data should live in human-editable files as well as structured storage.

### NFR-3: Fast retrieval
JD-to-evidence retrieval should return in seconds, not minutes.

### NFR-4: Auditability
Every generated bullet should be traceable to source facts.

### NFR-5: Storage discipline
The system should minimize file sprawl and avoid creating a new permanent exported file for every application.
Versioned text records are acceptable; uncontrolled file proliferation is not.

## 5. System Architecture

This spec supports two implementation modes:
- **Local MVP**: workspace files + SQLite + local vector store + lead-registry adapter
- **Hosted target**: Postgres + API/service layer + worker-based tailoring + object storage for exports

The system has six layers.

### Layer 0: Upstream lead ingestion layer
Reads job data from the external lead registry SQLite database when present.
For the local MVP, this registry is the canonical source for scraped job leads.
For the long-term hosted product, this layer should be replaceable by the hosted jobs/applications data model.

### Layer 1: Canonical truth layer
Stores the ground truth about Benny's experience.

Recommended formats:
- YAML or JSON for structured facts
- Markdown for richer human notes

### Layer 2: Normalized evidence layer
Breaks roles, projects, bullets, and skills into retrievable chunks.

### Layer 3: Embedding + retrieval layer
Embeds evidence chunks and resume sections into a vector database for similarity search.

### Layer 4: Assessment + decision layer
Parses a JD, scores fit, and decides whether tailoring is needed.
It should combine Needle's truth-first fit logic with upstream lead metadata, status, and existing fit/risk signals where useful.

### Layer 5: Generation + review layer
Builds a tailored resume draft, represents it as a reviewable resume version, shows a diff / rationale, and saves or approves it according to environment policy.

## 6. Workspace Structure

```text
resume-tailor/
  AGENTS.md
  SOUL.md
  USER.md
  MEMORY.md
  IMPLEMENTATION_SPEC.md
  data/
    profile/
      master_profile.yaml
      skills.yaml
      constraints.yaml
      preferences.yaml
    experience/
      roles.yaml
      projects.yaml
      achievements.yaml
    jobs/
      inbox/
      parsed/
      assessed/
      snapshots/
    integrations/
      lead_registry.yaml
    index/
      embeddings/
      metadata.db
  resumes/
    base/
      backend.md
      ai_ml.md
      product_strategy.md
    generated/
      approved/
      tmp/
  exports/
    pdf/
    docx/
  src/
    needle/
      ingest.py
      parse_jd.py
      assess.py
      retrieve.py
      tailor.py
      export.py
      models.py
      policy.py
      cli.py
  tests/
  scripts/
```

## 7. Data Model

## 7.1 Canonical profile schema

Suggested file: `data/profile/master_profile.yaml`

```yaml
person:
  name: Benny Yuan
  timezone: America/New_York
  target_roles: []

summary_facts:
  years_experience: null
  strongest_domains: []
  strongest_technologies: []

constraints:
  no_claims_without_evidence: true
  forbid_invented_metrics: true
  forbid_invented_ownership: true
```

## 7.2 Role schema

Suggested file: `data/experience/roles.yaml`

```yaml
roles:
  - id: role_001
    company: Example Co
    title: Senior Software Engineer
    start: 2022-01
    end: 2024-06
    location: Remote
    role_type: full_time
    domains:
      - fintech
    technologies:
      - Python
      - AWS
      - PostgreSQL
    responsibilities:
      - Built backend services for payments workflows
      - Improved reliability of core APIs
    achievements:
      - text: Reduced API latency through query and caching improvements
        metric: null
        evidence_strength: verified
    leadership:
      people_managed: 0
      mentorship: true
```

## 7.3 Project schema

Suggested file: `data/experience/projects.yaml`

```yaml
projects:
  - id: proj_001
    name: Internal analytics platform
    linked_roles:
      - role_001
    summary: Built internal tooling for reporting and analysis
    technologies:
      - Python
      - dbt
      - Snowflake
    outcomes:
      - text: Improved reporting speed for business users
        evidence_strength: supported
```

## 7.4 Bullet evidence schema

Suggested file: `data/experience/achievements.yaml`

```yaml
achievements:
  - id: ach_001
    role_id: role_001
    canonical_text: Improved backend API responsiveness through query optimization and caching
    tags:
      - backend
      - performance
      - api
    technologies:
      - Python
      - PostgreSQL
      - Redis
    domains: []
    evidence_strength: verified
    usable_in:
      - backend
      - infra
    prohibited_rewrites:
      - Led company-wide platform transformation
```

## 7.5 JD schema

Suggested file: `data/jobs/parsed/<job_id>.json`

```json
{
  "job_id": "job_2026_0001",
  "company": "Acme",
  "title": "Senior Backend Engineer",
  "seniority": "senior",
  "required_skills": ["Python", "AWS", "PostgreSQL"],
  "preferred_skills": ["Kubernetes", "Redis"],
  "responsibilities": [
    "Design scalable backend systems",
    "Collaborate cross-functionally"
  ],
  "domain": ["B2B SaaS"],
  "raw_text_path": "data/jobs/inbox/job_2026_0001.md"
}
```

## 7.6 Upstream lead registry mapping

Primary upstream source:
- `/Users/clawbot/.openclaw/workspace-job-searcher/data/lead-registry/lead-registry.sqlite`

Observed tables:
- `leads`
- `lead_observations`
- `lead_status_history`
- `lead_match_keys`
- `search_runs`
- `run_queries`
- `lead_registry_meta`

Needle should treat `leads` as the canonical job lead table and `lead_observations` as the raw/source observation history.

### Minimum field mapping from `leads`
- `lead_uid` -> upstream lead id
- `canonical_title` -> job title
- `canonical_company` -> company
- `canonical_location` -> location
- `canonical_url` -> source URL
- `canonical_summary` -> JD summary/body candidate
- `canonical_date_posted` -> date posted
- `employment_type` -> employment type
- `remote` / `hybrid` -> work mode
- `role_family_hint` -> upstream role family hint
- `seniority_hint` -> upstream seniority hint
- `current_decision` -> upstream keep/maybe/discard decision
- `review_status` -> review state
- `application_status` -> application workflow state
- `scores_json` -> upstream fit/ranking scores
- `signals_json` -> upstream heuristic signals
- `risks_json` -> upstream risk flags
- `metadata_json` -> extra source metadata

### Minimum field mapping from `lead_observations`
- `observation_id` -> source observation id
- `lead_uid` -> parent lead
- `source` -> job board / source system
- `source_job_id` -> source-native job id
- `summary` -> observed JD text
- `raw_json` -> raw scraped payload
- `canonical_snapshot_json` -> source snapshot if present

### Integration rule
Needle should prefer the most canonical available job text in this order:
1. `leads.canonical_summary`
2. newest high-quality `lead_observations.summary`
3. extracted text from `lead_observations.raw_json`
4. manual pasted JD text

### Sync rule
Needle should not mutate the upstream lead registry schema.
Instead it should:
- read from the external DB
- optionally cache normalized snapshots in `data/jobs/snapshots/`
- store Needle-specific assessments in its own workspace DB (`data/index/metadata.db`) keyed by `lead_uid`

## 8. Storage Components

### 8.1 Structured metadata store
Use SQLite for:
- local job metadata cache
- run history
- fit scores
- output retention records
- traceability links
- links back to upstream `lead_uid` values

Suggested DB file:
- `data/index/metadata.db`

Core tables:
- `jobs`
- `resume_variants`
- `evidence_chunks`
- `assessment_runs`
- `tailor_runs`
- `saved_outputs`
- `upstream_lead_links`

Design note:
- the upstream lead registry remains the source of scraped jobs
- Needle's local DB stores only Needle-specific state, caches, and traceability artifacts

### 8.2 Vector store
Use Chroma or LanceDB for embeddings.

Collections:
- canonical achievements
- role summaries
- project summaries
- base resume bullets
- JD chunks

Store metadata with each chunk:
- source file
- source id
- evidence strength
- technologies
- domains
- role type
- usable lanes

## 9. Resume Variant Strategy

The system should keep a small, durable library of base resumes.

In the local MVP, these may live as markdown files plus metadata.
In the hosted target architecture, these should map cleanly to `resume_versions(kind='base')`.

Each base resume should have:
- variant id
- target lane
- summary section
- ordered bullet selections
- skill emphasis
- target keywords

Each bullet in a base resume must reference one or more source achievement ids.

Example variant manifest:

```yaml
variant_id: backend
label: Backend / Infrastructure
source_role_ids:
  - role_001
source_achievement_ids:
  - ach_001
positioning:
  focus:
    - backend systems
    - performance
    - reliability
```

## 10. JD Assessment Pipeline

### Step 1: Ingest JD
Input:
- upstream lead registry record (`lead_uid`) [preferred for local MVP]
- pasted JD text
- URL-fetched JD text
- local file
- hosted canonical `job` or `application` reference [future target]

### Step 2: Parse JD
Extract structured fields and split into semantic chunks.
Also ingest any upstream hints already present, such as:
- `role_family_hint`
- `seniority_hint`
- `remote` / `hybrid`
- `scores_json`
- `signals_json`
- `risks_json`

Needle should use upstream hints as priors, not as final truth.
Its own assessment layer can agree, refine, or disagree.

### Step 3: Retrieve evidence
Run similarity search across:
- achievements
- projects
- roles
- base resume bullets

### Step 4: Score fit
Calculate:
- skill overlap score
- responsibility overlap score
- domain overlap score
- seniority alignment score
- leadership alignment score
- keyword alignment score
- risk penalty
- upstream prior adjustment

`upstream prior adjustment` should be a small modifier derived from upstream job-searcher scores/signals/risks.
It should never dominate Needle's own truth-first assessment.

### Step 5: Choose action
Decision rules:
- high fit + low gap -> use base resume
- high fit + moderate wording gap -> light tailoring
- plausible fit + meaningful narrative gap -> full tailoring
- high unsupported requirements -> caution / reject

## 11. Fit Scoring Formula

Initial weighted formula:

```text
fit_score =
  0.28 * skill_overlap +
  0.24 * responsibility_overlap +
  0.14 * domain_overlap +
  0.10 * seniority_alignment +
  0.10 * leadership_alignment +
  0.09 * keyword_alignment +
  0.05 * upstream_prior -
  risk_penalty
```

All component scores normalized to 0.0-1.0.

### Risk penalty
Risk penalty increases when the JD contains requirements with no verified or supported evidence.

Example:
- 0.00 -> no risk
- 0.10 -> a few adjacent but weak items
- 0.25 -> several important missing requirements
- 0.40+ -> role likely not defensible

### Initial thresholds
- `>= 0.82` and low risk: use base resume or tiny edits
- `0.68-0.81`: light tailoring
- `0.50-0.67`: full truthful tailoring if gaps are bridgeable
- `< 0.50` or high risk: caution / reject

These thresholds should be adjustable after real usage.

## 12. Tailoring Policy

Tailoring may do the following:
- reorder bullets
- swap in more relevant verified bullets
- rewrite summary to emphasize relevant strengths
- align terminology with the JD when the meaning is unchanged
- foreground relevant technologies or domain exposure
- de-emphasize irrelevant material

Tailoring may not:
- add unsupported tools
- add unsupported leadership claims
- add unsupported years of experience
- add invented team size or scope
- add fabricated numbers

## 13. Claim Confidence Model

Every reusable fact or bullet should have one of these labels:
- `verified`
- `supported`
- `weak`
- `forbidden`

Rules:
- `verified`: safe to use directly
- `supported`: safe to use with careful wording
- `weak`: do not use automatically; require review
- `forbidden`: never use

Example:
- verified: “Built internal analytics tooling in Python”
- supported: “Worked closely with product stakeholders”
- weak: “Led roadmap strategy”
- forbidden: “Managed a 10-person team” if never true

## 14. Generation Outputs

Each tailoring run should produce a structured output object like:

```json
{
  "job_ref": {
    "type": "lead_uid",
    "id": "job_2026_0001"
  },
  "application_ref": null,
  "selected_variant": "backend",
  "input_resume_version_ref": "base_backend_v1",
  "output_resume_version_ref": "tailored_tmp_001",
  "fit_score": 0.79,
  "action": "light_tailor",
  "risk_summary": [
    "No verified Kubernetes experience",
    "Leadership requirements are only partially supported"
  ],
  "changes": [
    "Rewrote summary for backend emphasis",
    "Reordered experience bullets to foreground API and performance work"
  ],
  "version_lineage": {
    "parent": "base_backend_v1",
    "child": "tailored_tmp_001"
  },
  "save_state": "ephemeral"
}
```

## 15. Output Retention Policy

Default exported-file mode for the local MVP: `ephemeral`

### Modes
- `ephemeral`: generate, show, do not save exported files
- `tmp`: save to `resumes/generated/tmp/` with cleanup TTL
- `approved`: save approved local review artifacts
- `exported`: save final docx/pdf artifacts in `exports/`

### Rules
- default exported artifacts to `ephemeral`
- only write files automatically if Benny explicitly asks
- if tmp mode is used, auto-delete files older than configured TTL
- save run metadata even if exported files are discarded
- allow meaningful text resume versions and tailoring runs to persist as structured records without requiring PDF/DOCX sprawl

## 16. CLI Commands

Suggested CLI:

```bash
needle ingest-profile
needle ingest-resume path/to/resume.md --variant backend
needle ingest-jd path/to/jd.txt
needle assess-jd data/jobs/inbox/job_2026_0001.md
needle tailor data/jobs/inbox/job_2026_0001.md --mode ephemeral
needle export --format pdf --input run_2026_0001
needle cleanup-tmp --older-than 7d
```

## 17. Python Module Responsibilities

### `models.py`
Pydantic models for profile, roles, projects, achievements, JDs, assessment results, and tailor runs.

### `ingest.py`
- load raw resumes
- map bullets to canonical achievements
- validate schema
- upsert structured facts
- sync selected upstream lead records into Needle's local cache

### `parse_jd.py`
- clean JD text
- extract structured fields
- normalize terminology
- merge upstream lead hints and source summaries into one parsed JD object

### `retrieve.py`
- embed chunks
- query vector store
- rank evidence

### `assess.py`
- compute overlap scores
- identify risks
- choose best base resume
- decide action class

### `tailor.py`
- build summary
- select bullet set
- rewrite within truth policy
- produce diff and rationale

### `policy.py`
- enforce truth constraints
- filter forbidden or weak claims
- validate final output

### `export.py`
- render markdown/docx/pdf
- respect save mode

### `cli.py`
- user-facing command routing

## 18. Decision Algorithm

Pseudocode:

```python
job_context = load_job_context(input_ref)
base_variants = load_resume_variants()
profile = load_canonical_profile()

best_variant = rank_base_variants(job_context, base_variants)
evidence = retrieve_supporting_evidence(job_context, profile)
risk = calculate_risk(job_context, evidence)
fit = calculate_fit(job_context, best_variant, evidence, risk)
action = choose_action(fit, risk)

input_resume_version = materialize_resume_version(best_variant)

if action == "use_base":
    output = input_resume_version
elif action in ["light_tailor", "full_tailor"]:
    output = tailor_resume(input_resume_version, job_context, evidence, policy="truth_first")
else:
    output = caution_report(job_context, evidence, risk)

record_tailoring_or_assessment_run(job_context, input_resume_version, output)
```

## 19. Review UX

Needle should present the result in this order:
- fit decision
- best base resume chosen
- top matched evidence
- missing / risky JD requirements
- tailored summary / changed bullets
- version lineage / review context
- save, approve, or discard prompt

Recommended user-facing statuses:
- `Strong fit — no real tailoring needed`
- `Good fit — light tailoring recommended`
- `Plausible fit — selective truthful rewrite recommended`
- `Weak fit — resume tailoring cannot honestly solve the gap`

## 20. Traceability Requirement

Every generated bullet should be able to map back to:
- role id
- achievement id
- evidence strength

That means generated bullets should carry hidden metadata in the run record, even if the visible resume is clean.

## 21. Testing Plan

### Unit tests
- schema validation
- JD parsing
- score calculations
- policy enforcement
- retention behavior

### Integration tests
- ingest real resume -> canonical facts
- assess JD -> choose variant
- tailor JD -> produce traceable bullet set
- discard ephemeral output -> keep metadata only

### Adversarial tests
- JD asks for tools Benny never used
- JD demands people management not supported by facts
- JD mentions metrics unavailable in source material
- system must refuse or soften unsupported claims

## 22. MVP Scope

### MVP includes
- canonical profile schema
- role / achievement ingestion
- 2-3 base resume variants
- JD parser
- vector retrieval over achievements and bullets
- fit classifier with simple thresholds
- truthful tailoring engine for summary + bullets
- ephemeral default output mode
- approval-based saving

### MVP excludes
- fancy UI
- automatic web scraping at scale
- cover letter generation
- multi-user support
- cloud sync
- active learning beyond manual review

## 23. Phase 2 Enhancements

After MVP works, consider:
- better JD parsing with normalization dictionaries
- cover letter generation from same truth base
- interview prep question generation
- company-specific emphasis rules
- application tracking dashboard
- adaptive fit thresholds based on Benny feedback

## 24. Recommended Build Order

1. Create schemas and folder structure
2. Add lead-registry integration config and field mapping
3. Build canonical profile + achievements store
4. Ingest Benny's current resumes
5. Create 3 base resume variants
6. Add vector index over achievements and bullets
7. Build JD parser with upstream lead support
8. Build fit assessment
9. Build tailoring engine with truth policy
10. Add ephemeral / approved retention modes
11. Add exporters and cleanup jobs

## 25. Acceptance Criteria

The implementation is successful when:
- Benny can submit a JD, lead, or future job/application reference and get a defensible fit assessment
- Needle can explain whether tailoring is necessary
- base resumes cover most jobs without creating uncontrolled exported file sprawl
- tailored resumes only contain supported claims
- meaningful resume versions and tailoring runs can be represented as structured records
- exported artifacts are ephemeral unless explicitly saved
- every saved bullet can be traced to canonical source facts
- the local MVP concepts map cleanly to future hosted models such as jobs, applications, resume_versions, tailoring_runs, and audit_events

## 26. Immediate Next Deliverables

The next concrete artifacts to produce are:
- `integrations/lead_registry.py`
- `data/integrations/lead_registry.yaml`
- `data/profile/master_profile.yaml`
- `data/experience/roles.yaml`
- `data/experience/projects.yaml`
- `data/experience/achievements.yaml`
- `src/needle/models.py`
- `src/needle/policy.py`
- `src/needle/assess.py`
- `src/needle/tailor.py`
- one sample lead-registry-to-assessment flow

## 27. Final Design Summary

Needle should behave like a selective, evidence-driven tailoring system.

It should not produce endless resume copies.
It should maintain one truth base, a small set of durable variants, and a retrieval system that decides whether tailoring is warranted.
When tailoring is warranted, it should rewrite for fit and clarity without crossing the line into fabrication.
