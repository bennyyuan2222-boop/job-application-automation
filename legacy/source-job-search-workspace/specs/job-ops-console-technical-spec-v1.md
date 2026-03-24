# Job Ops Console Technical Spec v1

_Status: draft_
_Last updated: 2026-03-17_

## 1) Objective

Build a hosted, single-user web app for Benny’s job-search pipeline.

This app is the operational surface for:
- scraped jobs
- explainable scoring and ranking
- shortlist decisions
- resume tailoring review
- application preparation
- final human submit review
- immutable activity history

The source of truth is **SQL**, not the current JSONL/file trackers.
Existing workspace files remain useful as scaffolding and historical notes, but they are **not** the canonical datastore for this product and should **not** be imported into v1.

## 2) Product constraints and locked decisions

### Deployment model
- Hosted web app
- Single-user only for v1
- Must be usable from different computers and locations

### Auth
- Email magic link
- Only Benny’s approved email should be allowed into the system in v1

### Source of truth
- PostgreSQL is canonical
- Frontend reads from API/read models backed by SQL
- Scrapers and future agents write into SQL-backed ingestion flows, not local files

### Scope in v1
Include:
- jobs
- resume tailoring
- applications
- activity/audit trail

Do not include in v1:
- cover letters
- custom written responses as a first-class workflow
- multi-user collaboration
- auto-submit of applications
- migration/import of existing JSONL trackers

### Submit boundary
- The system may prepare and eventually help fill applications
- Benny remains the person who reviews the real external portal and clicks submit
- Final review should use the **actual external portal in a new tab/window**, not screenshots as the primary source of truth

## 3) Recommended stack

### App layer
- **Next.js** (App Router)
- **React** + **TypeScript**
- Server components where useful for list/detail reads
- Route handlers / server actions as the backend-for-frontend layer

### Data layer
- **PostgreSQL** as the canonical database
- **Prisma** ORM for schema management and application queries
- Postgres full-text search and trigram indexes for job/company search

### Auth + email
- **Auth.js** with email magic links
- **Resend** (or equivalent transactional provider) for login emails
- Single allowlisted user email in v1

### Background work
- Dedicated worker service for long-running or async tasks
- **pg-boss** or equivalent Postgres-backed job queue to avoid introducing Redis early

### Storage
- Object storage (S3/R2-compatible) for:
  - rendered resume PDFs/DOCX files
  - raw artifacts
  - optional future browser snapshots

### Future automation layer
- Playwright-based browser worker/service
- Not required for v1 launch
- Designed so it can later write back application fill state, field confidence, and portal session metadata

### Hosting shape
- Web app deployed separately from workers
- Postgres managed separately
- Rationale:
  - web requests should stay fast and stateless
  - scraping/tailoring/automation tasks are long-running and should not live in request lifecycles

## 4) Core architecture

## 4.1 Main services

### A. Web app / API layer
Responsibilities:
- render inbox, shortlist, tailoring, applying, submit review, and activity surfaces
- authenticate the single allowed user
- expose mutation endpoints for stage changes and review decisions
- expose read models optimized for UI performance

### B. Ingestion pipeline
Responsibilities:
- accept raw scraped job batches from the scraper agent or scraper service
- store append-only raw source records
- normalize source data into canonical job records
- deduplicate across repeat scrapes and sources
- trigger scoring and enrichment

### C. Worker layer
Responsibilities:
- normalization jobs
- dedupe jobs
- scoring/ranking jobs
- company enrichment jobs
- tailoring generation jobs
- future application automation jobs

### D. Artifact storage
Responsibilities:
- store rendered resume files and future generated artifacts
- keep binary files outside the main relational tables

## 4.2 Architectural rule

**Scrapers should not write directly into the user-facing `jobs` table.**

Preferred flow:
1. scraper submits a batch
2. system records a `scrape_run`
3. system stores raw rows in `job_source_records`
4. normalizer/dedupe workers upsert canonical `jobs`
5. scorer writes `job_scorecards`
6. inbox read model becomes visible to the frontend

This keeps ingestion inspectable and recoverable.

## 5) Canonical domain model

The most important product decision is to keep **job postings** and **applications** separate.

A job can exist without an application.
An application only exists once Benny actively moves a job forward.

## 5.1 Core entities

### `users`
Purpose:
- authenticated users for the hosted app

Key fields:
- `id`
- `email`
- `role` (still useful even in single-user v1)
- `created_at`
- `last_login_at`

### `companies`
Purpose:
- canonical company identity

Key fields:
- `id`
- `name`
- `normalized_name`
- `website`
- `linkedin_url` (optional)
- `created_at`
- `updated_at`

### `company_profiles`
Purpose:
- enrichment and ranking context for company quality

Key fields:
- `company_id`
- `ai_native_score`
- `brand_value_score`
- `growth_signal_score`
- `quality_summary`
- `signals_json`
- `last_enriched_at`

This supports Benny’s stated ranking priorities around:
- strong AI product / AI-native quality
- brand / resume value
- startup energy / growth

### `scrape_runs`
Purpose:
- one record per scraper batch or sourcing run

Key fields:
- `id`
- `source_name`
- `started_at`
- `finished_at`
- `status`
- `query_params_json`
- `raw_count`
- `normalized_count`
- `deduped_count`
- `notes`

### `job_source_records`
Purpose:
- append-only raw scrape payloads
- provenance/debugging layer

Key fields:
- `id`
- `scrape_run_id`
- `source_name`
- `source_job_id`
- `source_url`
- `raw_payload_json`
- `scraped_at`
- `content_hash`

### `jobs`
Purpose:
- canonical deduplicated job postings shown in Inbox/Shortlist

Key fields:
- `id`
- `company_id`
- `title`
- `normalized_title`
- `location_text`
- `work_mode` (`remote`, `hybrid`, `onsite`, `unknown`)
- `employment_type`
- `salary_text`
- `salary_min`
- `salary_max`
- `job_url`
- `job_description_raw`
- `job_description_clean`
- `job_requirements_json`
- `first_seen_at`
- `last_seen_at`
- `status` (`discovered`, `shortlisted`, `archived`)
- `duplicate_of_job_id` (nullable)
- `latest_scrape_run_id`
- `created_at`
- `updated_at`

### `job_source_links`
Purpose:
- map canonical jobs to one or more raw source records

Key fields:
- `job_id`
- `job_source_record_id`
- `is_primary_source`

### `job_scorecards`
Purpose:
- versioned scoring and explanations for Inbox ranking

Key fields:
- `id`
- `job_id`
- `fit_score`
- `company_quality_score`
- `ai_relevance_score`
- `freshness_score`
- `priority_score`
- `top_reasons_json`
- `risks_json`
- `scorer_type` (`system`, `agent`, `manual_override`)
- `scored_at`

Notes:
- `priority_score` should rank primarily by:
  1. fit score
  2. company quality
  3. AI relevance
- freshness should be a tie-breaker, not the main signal
- explanations must always be stored alongside numeric scores

### `job_notes`
Purpose:
- lightweight human notes on a job before or after shortlisting

Key fields:
- `id`
- `job_id`
- `author_user_id`
- `body`
- `created_at`

### `resume_versions`
Purpose:
- canonical text versions of resumes for diff/review
- supports both base and tailored variants

Key fields:
- `id`
- `kind` (`base`, `tailored`)
- `parent_resume_version_id` (nullable)
- `title`
- `content_markdown`
- `sections_json`
- `rendered_pdf_url` (nullable)
- `rendered_docx_url` (nullable)
- `change_summary_json`
- `created_by_type` (`manual`, `agent`, `system`)
- `created_at`

Important implementation note:
- Do **not** treat PDF as the canonical format for review
- Store canonical resume content as text/structured blocks so the UI can render a stable side-by-side diff

### `applications`
Purpose:
- active application workflow records attached to jobs

Key fields:
- `id`
- `job_id`
- `status` (`tailoring`, `tailoring_review`, `paused`, `applying`, `submit_review`, `submitted`, `archived`)
- `base_resume_version_id`
- `tailored_resume_version_id` (nullable)
- `portal_url` (nullable)
- `portal_domain` (nullable)
- `completion_percent`
- `missing_required_count`
- `low_confidence_count`
- `paused_reason` (nullable)
- `submitted_at` (nullable)
- `created_at`
- `updated_at`

### `tailoring_runs`
Purpose:
- traceability for tailored resume generation and revision requests

Key fields:
- `id`
- `application_id`
- `input_resume_version_id`
- `output_resume_version_id` (nullable)
- `job_snapshot_json`
- `instructions`
- `status`
- `revision_note` (nullable)
- `created_at`
- `completed_at`

### `application_answers`
Purpose:
- structured answers/fields prepared for an application

Key fields:
- `id`
- `application_id`
- `field_key`
- `field_label`
- `field_group`
- `answer_json`
- `source_type` (`manual`, `agent`, `resume`, `derived`)
- `confidence`
- `review_state` (`accepted`, `needs_review`, `blocked`)
- `updated_at`

### `application_attachments`
Purpose:
- files attached or prepared for an application

Key fields:
- `id`
- `application_id`
- `attachment_type` (`resume`, `other`)
- `resume_version_id` (nullable)
- `file_url`
- `filename`
- `created_at`

### `portal_sessions`
Purpose:
- track the state of a live or future-assisted application portal session

Key fields:
- `id`
- `application_id`
- `mode` (`manual`, `automation`, `hybrid`)
- `launch_url`
- `provider_domain`
- `status` (`not_started`, `in_progress`, `ready_for_review`, `submitted`, `abandoned`)
- `last_known_page_title`
- `last_synced_at`
- `session_summary_json`
- `notes`

Important note:
- in v1, this table can begin very light
- its main purpose is to support a future automation agent without redesigning the application model later

### `audit_events`
Purpose:
- immutable history of system and user actions

Key fields:
- `id`
- `entity_type` (`job`, `application`, `resume_version`, `portal_session`, `scrape_run`)
- `entity_id`
- `event_type`
- `actor_type` (`user`, `agent`, `system`)
- `actor_label`
- `before_state` (nullable)
- `after_state` (nullable)
- `payload_json`
- `created_at`

## 5.2 Workflow state model

### Job state machine
A job exists before an application exists.

Canonical job states:
- `discovered`
- `shortlisted`
- `archived`

Recommended behavior:
- newly normalized/scored jobs land in `discovered`
- Benny can move strong jobs to `shortlisted`
- moving a shortlisted job into active resume work creates an application record

### Application state machine
Once Benny commits to moving forward, the application has its own lifecycle.

Canonical application states:
- `tailoring`
- `tailoring_review`
- `paused`
- `applying`
- `submit_review`
- `submitted`
- `archived`

Reason for this split:
- avoids overloading a single state field with two different kinds of records
- keeps pre-application triage separate from post-commit application work
- removes ambiguity between the two different review checkpoints

## 6) Primary workflows

## 6.1 Scraped jobs → Inbox

1. scraper submits a batch to an internal ingestion endpoint or worker trigger
2. system creates `scrape_runs` row
3. raw jobs are stored in `job_source_records`
4. normalization worker extracts canonical fields
5. dedupe worker links or creates `jobs`
6. scoring worker writes `job_scorecards`
7. jobs appear in Inbox ordered by `priority_score`

Implementation rule:
- raw provenance is append-only
- canonical jobs are upserted carefully
- duplicates are linked, not silently deleted

## 6.2 Inbox / Shortlist triage

1. frontend queries the Inbox read model
2. Benny reviews score explanations, company quality, and AI relevance
3. Benny can:
   - shortlist
   - archive
   - mark duplicate
   - open original listing
   - add notes
   - start application/tailoring from a shortlisted job

When Benny starts application/tailoring:
- create `applications` row
- set application status to `tailoring`
- attach chosen base resume version

## 6.3 Tailoring review

1. tailoring worker creates a new `resume_version` of kind `tailored`
2. application enters `tailoring_review`
3. frontend shows base resume vs tailored resume with JD beside it
4. Benny can:
   - approve
   - request edits
   - pause

Because Benny chose overall approval for v1:
- store review decision at the application/tailoring run level
- per-bullet review is optional future work, not required for the initial schema

## 6.4 Applying queue

1. approved tailored application moves to `applying`
2. system stores structured answers, attachments, and portal metadata
3. future automation can update `application_answers` and `portal_sessions`
4. UI shows completeness, missing fields, and low-confidence answers
5. Benny or future agents can move an application onward when it is ready for final human review

## 6.5 Submit review

1. application moves to `submit_review`
2. app displays the review checklist, structured answers, chosen resume, and activity trail
3. primary CTA opens the **real external portal in a new tab/window**
4. Benny inspects the live filled portal state there
5. Benny clicks submit in the external portal
6. Benny returns to the app and marks the application `submitted`

Technical reason for new-tab review:
- many third-party job portals block iframe embedding
- Benny wants the real portal, not a screenshot proxy
- normal browser/tab behavior works better across different computers

## 7) Read models for the frontend

The frontend should not assemble heavy queue views from raw normalized tables on every request.
Use dedicated SQL views or query-layer read models.

Recommended read models:
- `job_inbox_view`
- `job_shortlist_view`
- `tailoring_queue_view`
- `applying_queue_view`
- `submit_review_view`
- `activity_feed_view`

## 7.1 Inbox read model should expose
- job id
- title
- company name
- location/work mode
- freshness
- fit score
- company quality score
- AI relevance score
- priority score
- top reasons
- risk flags
- duplicate flag
- current job state
- whether an open application already exists

## 7.2 Tailoring workspace read model should expose
- application id
- job title/company
- base resume content
- tailored resume content
- diff/change summary
- parsed JD requirements
- fit explanation
- prior review notes
- last tailoring run metadata

## 7.3 Applying queue read model should expose
- application id
- job title/company
- portal domain
- completion percent
- missing required count
- low-confidence count
- selected tailored resume
- last activity timestamp
- current status

## 7.4 Submit review read model should expose
- application id
- portal launch URL
- structured answers summary
- attached resume metadata
- outstanding warnings
- recent activity timeline
- explicit review checklist state

## 8) API surface

Use the web app as a backend-for-frontend layer.
The browser should call stable API endpoints or server actions, not query the database directly.

## 8.1 Internal ingestion endpoints

### `POST /api/internal/scrape-runs`
Create a scrape run and enqueue normalization.

### `POST /api/internal/scrape-runs/:id/records`
Submit raw scraped records in batches.

### `POST /api/internal/jobs/re-score`
Re-score a set of jobs after enrichment or heuristic changes.

These endpoints should require service authentication and never be exposed as general user actions.

## 8.2 Job endpoints

### `GET /api/jobs`
Supports:
- search
- filters
- sort presets
- pagination
- state filter (`discovered`, `shortlisted`, `archived`)

### `GET /api/jobs/:jobId`
Returns a detailed job view with score explanations, company profile, and notes.

### `POST /api/jobs/:jobId/shortlist`
Move job to `shortlisted`.

### `POST /api/jobs/:jobId/archive`
Archive the job.

### `POST /api/jobs/:jobId/mark-duplicate`
Mark the job as duplicate and link it to a canonical job.

### `POST /api/jobs/:jobId/start-application`
Create an application and move it to `tailoring`.

## 8.3 Application endpoints

### `GET /api/applications`
Supports queue filters for:
- `tailoring`
- `tailoring_review`
- `paused`
- `applying`
- `submit_review`
- `submitted`

### `GET /api/applications/:applicationId`
Returns the full application workspace model.

### `POST /api/applications/:applicationId/pause`
Pause an active application.

### `POST /api/applications/:applicationId/resume`
Resume a paused application.

### `POST /api/applications/:applicationId/archive`
Archive application.

### `POST /api/applications/:applicationId/move`
Generic state transition endpoint with validation guardrails.

## 8.4 Tailoring endpoints

### `POST /api/applications/:applicationId/tailoring/generate`
Trigger a tailoring run.

### `POST /api/applications/:applicationId/tailoring/request-edits`
Record edit request and spawn a new tailoring run.

### `POST /api/applications/:applicationId/tailoring/approve`
Approve current tailored resume and move application forward.

## 8.5 Applying / submit-review endpoints

### `POST /api/applications/:applicationId/portal/open`
Return the launch URL and register/open a portal session.

### `POST /api/applications/:applicationId/ready-for-submit-review`
Move application into `submit_review` if required conditions are met.

Required conditions should include at minimum:
- tailored resume selected
- required attachments present
- missing field count at or below chosen threshold
- no hard blockers

### `POST /api/applications/:applicationId/mark-submitted`
Final manual confirmation after Benny submits in the external portal.

## 8.6 Activity endpoints

### `GET /api/activity`
Global audit feed with filters by entity type and event type.

### `GET /api/:entityType/:entityId/activity`
Per-record timeline.

## 9) Ranking and explainability

The system should not behave like a black box.

For each job, store:
- component scores
- top reasons
- risk flags
- last scored timestamp
- scorer type

Recommended initial weighting for `priority_score`:
- fit score: highest weight
- company quality: second weight
- AI relevance: third weight
- freshness: tie-breaker / recency adjustment only

The UI should always be able to explain:
- why this job is near the top
- what makes the company high-quality
- why the role is AI-relevant or not

## 10) Resume representation and diff support

Because the UI needs a stable side-by-side diff, resume storage should support both human review and file export.

Recommended canonical representation:
- `content_markdown` for whole-document review
- `sections_json` for structured block comparison
- rendered PDF/DOCX as secondary artifacts

This allows:
- changed-section highlighting
- collapse of unchanged sections
- stable regeneration without losing reviewability

## 11) Auditability

Every meaningful action should create an `audit_event`.

Examples:
- job ingested
- job deduped
- score recalculated
- job shortlisted
- application created
- tailoring generated
- tailoring approved
- tailoring edit requested
- application paused
- portal opened
- application moved to submit review
- application marked submitted

Auditability matters even in single-user v1 because automated systems and manual review will mix.

## 12) Security and safety

### Auth/security principles
- only allowlisted email can sign in
- all mutating endpoints require authenticated user context
- internal ingestion endpoints require separate service auth
- final submit is always manual in the third-party portal

### Data handling
- store as little third-party credential/session data as possible
- keep artifacts in object storage, not giant blobs in core tables
- redact or avoid storing sensitive portal secrets in audit payloads

## 13) Deployment recommendation

Recommended initial deployment shape:
- Next.js web app on Vercel or equivalent
- managed Postgres (Neon/Supabase/RDS equivalent)
- worker service on Fly/Railway/Render or equivalent long-lived host
- object storage for artifacts

Reasoning:
- hosted access from different computers matters
- long-running workers should not depend on serverless request limits
- browser automation later will need its own runtime anyway

## 14) Phased implementation plan

### Phase 1
- auth
- SQL schema
- ingestion pipeline
- Inbox + Shortlist read models and actions
- activity log

### Phase 2
- resume version storage
- tailoring runs
- Tailoring Review workspace APIs
- application records and Applying queue

### Phase 3
- portal session tracking
- submit review workflow
- future automation hooks for application filling

## 15) Final recommendation

Build the first real version as a **SQL-first, hosted ops console** with a clean separation between:
- raw scraped data
- canonical jobs
- applications
- resume versions
- audit history

This gives the frontend a durable backend contract now, while leaving room for later browser automation without forcing a redesign of the core data model.