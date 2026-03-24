# Job Ops Console UI Spec v1

_Status: draft_
_Last updated: 2026-03-17_

## 1) Product stance

This should feel like a **single-user recruiting ops console**, not a BI dashboard and not a consumer job board.

The product is primarily about:
- triaging noisy inbound jobs
- moving strong opportunities through a pipeline
- reviewing tailored resume output
- preparing applications
- doing a final human check before submit

The home of the product is **work queues**, not analytics.

## 2) Design references

Use this reference blend:
- **Ashby** for the pipeline shell and queue-first workflow
- **Linear Triage** for inbox review behavior
- **GitHub PR review** for the tailoring workspace mental model
- **Stripe Radar** for explainable scores and surfaced signals
- **Airtable record review** for list/detail ergonomics
- **GitHub audit log** for activity history

These references are useful because the product needs to be:
- dense
- calm
- operational
- explainable
- review-heavy

## 3) Locked UI decisions

### Deployment and access
- hosted web app
- single-user only in v1
- should work well on a laptop or desktop from different locations
- desktop-first, not mobile-first

### Canonical state model shown in UI
Jobs and applications are different objects, so their visible states should also be different.

#### Job states
- `discovered`
- `shortlisted`
- `archived`

#### Application states
- `tailoring`
- `tailoring_review`
- `paused`
- `applying`
- `submit_review`
- `submitted`
- `archived`

### Review model
- tailoring review is **overall approve / request edits** for v1
- final submit review happens in the **real external portal opened in a new tab/window**
- the app acts as the companion/control surface, not an iframe wrapper around the portal

### Ranking priority in Inbox
Default ranking order should optimize for:
1. fit score
2. company quality
3. AI relevance

Freshness should help break ties, but should not dominate the ranking.

## 4) Global information architecture

Recommended main navigation:
- **Inbox**
- **Shortlist**
- **Tailoring**
- **Applying**
- **Submit Review**
- **Activity**

Why this structure works:
- it mirrors the actual work Benny wants to do
- it emphasizes queues instead of passive dashboards
- it keeps pre-application and post-application work mentally separate

## 5) Global UI principles

### A. Queue-first
The user should always be able to answer:
- what needs attention now?
- what is most worth reviewing next?
- what is blocked?
- what is waiting for my approval?

### B. Explainable, not mysterious
Scores and statuses should never be opaque.
The UI should show:
- why a job ranks highly
- what makes a company high-quality
- what makes a role AI-relevant
- what is still missing from an application

### C. Dense but calm
This is an internal tool.
It should favor:
- scan speed
- quick actions
- information density
- restrained visuals

It should avoid:
- oversized marketing-style cards
- decorative charts with no operational value
- excessive whitespace
- flashy motion for its own sake

### D. List + detail, not endless context switching
Where possible, the UI should use a list/detail pattern:
- queue on the left or center
- selected record details on the right

### E. Review should feel intentional
Both review checkpoints should feel like explicit decision moments:
- tailoring review
- submit review

## 6) Shared app shell

## 6.1 Layout

### Left navigation rail
Should include:
- product name / logo area
- main nav items
- count badges for active queues
- subtle section divider before Activity

### Top bar
Should include:
- global search
- saved views / filter preset selector
- quick filter chips for the current surface
- user/account menu (minimal for single-user app)

### Main content area
Varies by screen, but should generally use:
- queue/list region
- detail pane or workspace region
- minimal but clear page header

## 6.2 Cross-screen patterns

### Count badges
Nav items should show counts for:
- Inbox items needing review
- Shortlist items not yet moved forward
- Tailoring items in review
- Applying items with blockers or missing fields
- Submit Review items waiting on Benny

### Notes
Any job or application should support lightweight note-taking.
Notes should be visible in the detail area and also appear in Activity.

### Activity access
Every major record view should provide an embedded recent timeline plus a link to full activity.

### Search and filters
Search should work across at least:
- job title
- company name
- source
- notes

Filters should include:
- state/status
- work mode
- source
- fit band
- company quality band
- AI relevance band
- duplicate flag
- paused state

### Bulk actions
At minimum, bulk actions should exist in Inbox and Shortlist.

## 7) Screen 1 — Inbox

This should be the home screen.

## 7.1 Purpose

Inbox is where Benny reviews newly scraped or newly surfaced jobs and decides what deserves attention.

This is the highest-priority surface in the product because the upstream feed is noisy.

## 7.2 Layout

Recommended structure:
- optional compact filter rail or filter chip row at the top
- dense central table for jobs
- right-side detail drawer/pane for the selected job

## 7.3 Default sort

Default sort should be:
1. highest fit score
2. highest company quality
3. highest AI relevance
4. newest/freshest as tie-breaker

The default experience should feel like “best opportunities first,” not “latest scrape first.”

## 7.4 Table columns

Recommended columns:
- title
- company
- location / work mode
- source
- scraped / freshness time
- fit score
- company quality
- AI relevance
- top reasons
- state
- quick actions

Optional secondary columns:
- salary band
- duplicate indicator
- notes count

## 7.5 Row actions

Must-have row actions:
- shortlist
- archive
- mark duplicate
- open original listing
- add note

Secondary action:
- send to tailoring (only when the job is already shortlisted or when a one-click shortcut is explicitly desired)

## 7.6 Detail pane

When a job is selected, the detail pane should show:
- job header: title, company, location, work mode
- score summary
- top reasons the system likes the role
- risks / concerns
- company quality panel
- AI relevance explanation
- short JD summary
- open original listing CTA
- notes
- recent activity

## 7.7 Company quality panel

Because company quality is a core ranking factor, it should have an explicit explanation block.

This panel should surface:
- strong AI product / AI-native signals
- brand / resume value
- startup energy / growth indicators
- any obvious concerns

## 7.8 Filter presets

Recommended presets:
- New
- High fit
- Strong company quality
- Strong AI relevance
- Needs action
- Duplicates
- Archived

## 7.9 Bulk behavior

Bulk actions for Inbox:
- shortlist selected
- archive selected
- mark duplicate selected

Bulk behavior should be present but not overdesigned in v1.

## 8) Screen 2 — Shortlist

Shortlist should reuse the Inbox shell, but with a different purpose.

## 8.1 Purpose

Shortlist is where Benny keeps promising jobs that survived triage but have not yet entered active application work.

## 8.2 Layout

Use the same list/detail structure as Inbox for consistency.

## 8.3 Key differences from Inbox

Shortlist should emphasize movement, not initial judgment.

Primary actions here:
- send to tailoring
- archive
- open job listing
- add/update notes

Helpful supporting signals:
- how long the job has been sitting in Shortlist
- whether the posting is getting stale
- whether a base resume has already been chosen or suggested

## 9) Screen 3 — Tailoring

This is the most important specialized workspace in the app.

## 9.1 Purpose

Tailoring is where Benny reviews a proposed resume adaptation against the base resume and the target job description.

This should feel like a **review workspace**, not a generic form and not a document editor.

## 9.2 Layout

Use a **3-column desktop workspace**.

### Left column
- base resume

### Center column
- tailored resume
- changed sections highlighted
- unchanged sections collapsible

### Right column
- job description
- extracted requirements / signals
- fit rationale summary

## 9.3 Top bar

The top bar should include:
- job title
- company
- current application state
- fit summary or score chip
- actions:
  - approve
  - request edits
  - pause
  - regenerate (optional secondary action)

## 9.4 Review model

Because Benny chose coarse-grained review for v1, the primary actions are:
- **Approve**
- **Request edits**

This means:
- line-level accept/reject is not required in v1
- the UI should still highlight changed sections, but the decision is overall

## 9.5 What the user should be able to judge quickly

At a glance, Benny should be able to answer:
- what changed?
- does the tailored version actually match the role?
- did the system overfit or invent anything?
- is this version good enough to move forward?

## 9.6 Diff behavior

Recommended behavior:
- side-by-side view by default
- changed sections visibly highlighted
- unchanged sections collapsed by default if needed for scan speed
- section anchors or quick nav for Summary / Experience / Projects / Skills

## 9.7 Request edits interaction

Request edits should open a compact modal or side sheet with:
- free-text revision note
- optional quick reasons such as:
  - too generic
  - overfitted
  - not enough AI emphasis
  - wrong emphasis
  - awkward wording

That note should be saved into the tailoring run history and visible in Activity.

## 10) Screen 4 — Applying

## 10.1 Purpose

Applying is the operational queue for applications that are in progress or mostly prepared but not yet at final human submit review.

This screen should feel like a work queue with checklists, not a giant freeform form builder.

## 10.2 Layout

Recommended structure:
- center/left queue list of applications
- right detail pane with application readiness details

## 10.3 Queue row content

Each application row should show:
- job title
- company
- portal/domain
- completion percentage
- missing required field count
- low-confidence answer count
- last updated time
- current status badge

## 10.4 Detail pane

The detail pane should show:
- application summary
- tailored resume attached/selected
- structured answers grouped by section
- missing fields checklist
- low-confidence answers checklist
- portal metadata
- recent activity

## 10.5 Primary actions

Must-have actions:
- open portal
- pause
- move to Submit Review
- send back for edits if a major mismatch is discovered

Optional later action:
- resume automation session

## 10.6 Checklist-first UX

The screen should emphasize unresolved work through checklists, including:
- required unanswered fields
- low-confidence auto-filled answers
- missing attachment confirmation
- portal-specific blockers

This is more useful than burying uncertainty inside a giant form.

## 11) Screen 5 — Submit Review

This is the final trust gate before submit.

## 11.1 Purpose

Submit Review exists so Benny can verify the live external application before clicking submit.

It is not another generic edit screen.
It is a deliberate final checkpoint.

## 11.2 Interaction model

Primary flow:
1. Benny opens the Submit Review record in the app
2. Benny clicks **Open live portal**
3. the external application portal opens in a new tab/window
4. Benny inspects the real filled portal there
5. Benny submits there if everything looks right
6. Benny returns to the app and clicks **Mark submitted**

## 11.3 Layout

Recommended structure:
- left/main pane: application packet summary
- right pane: final review checklist + recent activity

## 11.4 Main content

The main summary should show:
- job + company header
- selected tailored resume
- structured answers summary
- attachment summary
- known warnings or low-confidence answers
- portal/domain info

## 11.5 Final checklist

The checklist should include at minimum:
- resume attached correctly
- tailored content matches the role
- required questions are answered
- compensation / location / visa answers look correct
- no hallucinated information is visible
- external portal looks correct and complete

## 11.6 Primary actions

Must-have actions:
- open live portal
- mark submitted
- send back to Applying
- pause
- archive

## 11.7 Important UX rule

The app should never imply that the application is submitted until Benny explicitly confirms it.

A portal being filled or “ready” is not the same thing as submitted.

## 12) Screen 6 — Activity

## 12.1 Purpose

Activity is the global audit surface for understanding what changed, when it changed, and why.

## 12.2 Layout

Use a searchable chronological feed.

Each event row should show:
- timestamp
- event type
- entity reference
- actor
- state change summary if applicable
- short payload summary

## 12.3 Filters

Filters should include:
- jobs vs applications
- event type
- date range
- manual vs agent vs system actions

## 12.4 Embedded activity

In addition to the full Activity screen, each job and application detail pane should show a recent activity excerpt.

## 13) Cross-cutting UX behaviors

## 13.1 Explainability everywhere

Do not show a score chip without context nearby.

For jobs, always surface:
- why this ranked high
- why the company is attractive or weak
- why this is AI-relevant or not

For applications, always surface:
- what is missing
- what is low-confidence
- why the item is blocked or paused

## 13.2 Saved views

Saved views are especially useful for this product.

Recommended early saved views:
- Inbox / High Fit
- Inbox / Strong AI
- Inbox / High Company Quality
- Shortlist / Aging
- Applying / Needs Attention
- Submit Review / Waiting On Me

## 13.3 Keyboard support

Helpful shortcuts for desktop-heavy use:
- move selection up/down in queue
- shortlist
- archive
- open original listing
- open live portal
- approve tailored resume
- request edits

Keyboard shortcuts are not required for v1 launch, but the interface should leave room for them.

## 13.4 Empty states

Empty states should be plain and useful.

Examples:
- Inbox empty: “No new jobs need review right now.”
- Tailoring empty: “Nothing is waiting on resume review.”
- Submit Review empty: “No applications are waiting on final eyes-on review.”

Avoid motivational fluff.

## 14) Visual design guidance

## 14.1 Tone

Use a calm, information-dense internal-tool visual language.

This should feel:
- steady
- credible
- efficient
- quiet

## 14.2 Color usage

Recommended semantics:
- neutral background and surfaces
- one primary accent color for actions
- amber for needs review / low confidence / paused attention
- green only for confirmed completed/submitted states
- red only for destructive actions or hard blockers

## 14.3 Typography and spacing

Prefer:
- compact row heights
- clear hierarchy
- readable monospace or tabular numerals where counts/scores matter
- enough spacing to scan, but not excessive breathing room

## 14.4 Metrics treatment

If metrics appear at all, they should be compact summary chips or small counters.
Do not turn v1 into an analytics dashboard home.

## 15) Responsive behavior

This product should be desktop-first.

Recommended behavior:
- laptop and desktop are primary targets
- on narrower screens, the right detail pane can become a drawer or full page
- Tailoring’s 3-column layout may collapse to tabbed panes on smaller widths
- mobile support can be minimal in v1

## 16) Out of scope for v1 UI

Do not spend v1 effort on:
- cover letter workspace
- custom essay workspace
- team comments/mentions/permissions
- analytics-heavy homepage
- overly fancy kanban-first interactions

The highest-value UI work is:
- Inbox triage
- Tailoring review
- Applying readiness
- Submit Review trust checkpoint
- Activity visibility

## 17) Final recommendation

Build a **queue-first hosted ops console** with these six surfaces:
- Inbox
- Shortlist
- Tailoring
- Applying
- Submit Review
- Activity

The most important UI bets are:
- Inbox as the home screen
- explainable ranking instead of black-box scores
- Tailoring as a real review workspace
- Submit Review as a live-portal trust gate
- dense, calm, operational design instead of glossy dashboard aesthetics