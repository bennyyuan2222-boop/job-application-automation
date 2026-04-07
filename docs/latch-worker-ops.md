# Latch worker ops runbook

_Last updated: 2026-04-07_

This is the fastest way to start, observe, and smoke-test the Latch worker lane on the Mac mini without waiting on every UI integration.

## What Latch does in this slice

Current task type:
- `prepare_application_workspace`

Current boundary:
- queue + heartbeat + DB/audit wiring are real
- the final OpenClaw bridge is **not** implemented yet

That means a healthy smoke test can still end in:
- `failureCode = "latch_agent_not_implemented"`

That failure is useful right now. It proves:
- the task was enqueued correctly
- the worker claimed it
- the runtime reached the Latch boundary
- failure data came back through the expected DB path

## Prereqs

From repo root:

```bash
cd /Users/clawbot/Documents/job-ops-console
```

Use the same `.env` that points at the Neon/Postgres database used by the app.

Before using the Latch worker or ops helper, make sure the latest Prisma migrations have been applied to that database:

```bash
npm run db:migrate:deploy
```

Useful env knobs:
- `LATCH_WORKER_LABEL` - worker label stored in `LatchWorkerHeartbeat`
- `LATCH_WORKER_POLL_MS` - watch-loop poll interval, default `5000`
- `LATCH_WORKER_MAX_TASKS_PER_CYCLE` - drain cap per loop, default `25`
- `OPENCLAW_BIN` - explicit OpenClaw binary path if autodetect is wrong

## Start the worker

One-shot drain:

```bash
npm run latch:queue:once:local
```

Continuous watch loop:

```bash
npm run latch:queue:watch:local
```

Expected boot log shape:

```text
[latch-runner] boot worker=latch-macmini-worker pid=... host=... dbHost=... openclawBin=...
```

## Inspect worker health

Latest heartbeats:

```bash
npm run latch:ops:local -- heartbeat
```

Specific worker label:

```bash
npm run latch:ops:local -- heartbeat --workerLabel=latch-macmini-worker
```

What to look for:
- `state = "idle"` or `"drained"` while healthy and caught up
- `state = "processing"` while actively handling a task
- `lastErrorCode` and `lastErrorMessage` when the loop fails
- `openclawBin`, `hostname`, and `dbHost` to confirm the runtime you expected

## Queue a manual debug task

If you already know the approved tailoring run id:

```bash
npm run latch:ops:local -- enqueue --applicationId=<applicationId> --approvedTailoringRunId=<tailoringRunId>
```

If you do **not** pass `--approvedTailoringRunId`, the helper automatically uses the latest approved tailoring run for that application.

Optional actor label:

```bash
npm run latch:ops:local -- enqueue --applicationId=<applicationId> --actorLabel=operator:smoke-test
```

Notes:
- enqueue only works when the application is already in `applying`
- the application must already have a selected `tailoredResumeVersionId`
- if there is already an active queued/processing task, the enqueue path may reuse that task instead of making a duplicate

## Inspect one application

Application-centric status:

```bash
npm run latch:ops:local -- status --applicationId=<applicationId>
```

Include raw request/response payloads:

```bash
npm run latch:ops:local -- status --applicationId=<applicationId> --includePayloads
```

This returns JSON with:
- application summary and readiness-adjacent counters
- latest approved tailoring run
- latest Latch tasks
- latest attachments, answers, and portal sessions
- recent Latch audit events
- recent worker heartbeats

## Inspect the queue globally

Recent tasks:

```bash
npm run latch:ops:local -- queue
```

Only failed tasks:

```bash
npm run latch:ops:local -- queue --status=failed --includePayloads
```

Useful for checking:
- whether tasks are stacking up in `queued`
- whether the worker is turning them into `processing`
- whether the current expected failure is `latch_agent_not_implemented` or something worse

## Recommended smoke test

1. Confirm the app is in `applying` and has an approved tailoring run.
2. Queue a manual task:

```bash
npm run latch:ops:local -- enqueue --applicationId=<applicationId>
```

3. Drain once:

```bash
npm run latch:queue:once:local
```

4. Inspect status:

```bash
npm run latch:ops:local -- status --applicationId=<applicationId> --includePayloads
```

Current expected result:
- task moves `queued -> processing -> failed`
- `failureCode` is `latch_agent_not_implemented`
- heartbeat updates and points at the worker/runtime that processed it
- audit trail shows queue and failure events

## If something looks wrong

### Task never leaves `queued`
Check:
- worker process actually running
- `.env` points at the same database as the app
- heartbeat rows are updating
- no stale zombie task is blocking the application

### Task fails before reaching the expected not-implemented boundary
Likely causes:
- invalid application state, especially not being in `applying`
- missing selected tailored resume version
- missing approved tailoring run for auto-resolve enqueue
- schema/request validation issues

Use:

```bash
npm run latch:ops:local -- status --applicationId=<applicationId> --includePayloads
npm run latch:ops:local -- queue --status=failed --includePayloads
```

### Heartbeat is stale
Check:
- process manager / terminal session died
- worker label changed unexpectedly
- DB connectivity dropped

## Best next step after this runbook

Once this lane is stable, implement the real Mac mini worker bridge from queued Latch task -> OpenClaw `application-ops` agent request/response, then keep using this runbook to verify that the typed response is written back cleanly.
