# Phase 6 - Async Needle Worker Topology

## Target topology

- **Frontend / server actions:** Vercel
- **Database / queue:** Neon Postgres
- **OpenClaw agents + worker runtime:** Mac mini

## Why this exists

Vercel-hosted server code cannot safely assume it can spawn the local `openclaw` CLI or reach loopback resources on the Mac mini. The correct split is:

1. Vercel writes Needle work requests into Neon
2. Mac mini worker consumes queued tasks locally
3. Mac mini writes results back into Neon
4. Vercel UI reads statuses/results from Neon

## Queue model

Needle work is represented by `NeedleTask` records.

Worker health is represented by `NeedleWorkerHeartbeat` rows.

### Task types
- `generate_draft`
- `request_edits`

### Task statuses
- `queued`
- `processing`
- `completed`
- `failed`
- `cancelled`

### Worker heartbeat
Each worker updates a heartbeat row with:
- worker label
- process id / hostname
- DB host
- resolved OpenClaw binary path
- current state (`polling`, `processing`, `idle`, `drained`, `error`)
- last poll time
- last claimed/completed task ids
- last error code/message

## Current Vercel behavior

The following paths now enqueue work instead of invoking Needle inline:

- start application bootstrap
- generate fresh draft
- request edits

The UI reads `activeTask` from Neon and disables duplicate actions while work is queued/processing.

## Mac mini worker commands

Run one task once:

```bash
cd /Users/clawbot/Documents/job-ops-console
npx dotenv -e .env -- npm run --workspace @job-ops/needle-worker queue:once
```

Run the continuous worker loop:

```bash
cd /Users/clawbot/Documents/job-ops-console
npx dotenv -e .env -- npm run --workspace @job-ops/needle-worker queue:watch
```

Optional env:

- `NEEDLE_WORKER_LABEL` - worker label stored on tasks/audit events
- `NEEDLE_WORKER_POLL_MS` - polling interval in milliseconds
- `OPENCLAW_BIN` - explicit path to OpenClaw CLI if needed

## Deployment checklist

### Neon / hosted DB
Apply all pending Prisma migrations against the same Neon database used by Vercel.

```bash
cd /Users/clawbot/Documents/job-ops-console
npx dotenv -e .env -- npm run db:migrate:deploy
```

### Vercel
- Deploy the latest web build
- Ensure Vercel points at the migrated Neon database
- Vercel does **not** need local OpenClaw access for draft generation anymore once queue mode is in use

### Mac mini
- Pull latest code
- Use the same Neon database URL as Vercel
- Ensure OpenClaw is installed and the real `resume-tailor` agent is available
- Start the queue worker (`queue:watch`) under a persistent process manager

## Recommended process manager

Any of these are acceptable:
- launchd
- pm2
- tmux/screen (temporary only)

For production-ish reliability, prefer launchd or pm2.

## Success criteria

When healthy:
- clicking **Generate fresh draft** creates a `NeedleTask(status=queued)`
- Mac mini worker claims it as `processing`
- worker runs Needle locally
- worker writes completed result + `resultTailoringRunId`
- application moves to `tailoring_review`
- UI auto-refreshes and shows the finished draft
- worker heartbeat keeps updating while the queue drains

## Failure behavior

If the worker fails:
- task status becomes `failed`
- failure code/message are stored on the task
- related Tailoring run may also show failed state if a run was already opened
- UI should no longer imply the work is still in progress

If a queued or processing task becomes stale for the same application and no fresh worker heartbeat exists:
- the stale task is marked failed (`needle_task_stale_queue` / `needle_task_stale_processing`)
- a new user-triggered action can enqueue a replacement task instead of getting stuck forever behind zombie dedupe
