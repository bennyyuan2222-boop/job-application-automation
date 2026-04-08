#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/clawbot/Documents/job-ops-console"
cd "$ROOT"

application_id=""
approved_tailoring_run_id=""
actor_label="${LATCH_SMOKE_ACTOR_LABEL:-operator:latch-smoke}"
skip_migrate=0

usage() {
  cat <<'EOF'
Latch local smoke runner

Usage:
  npm run latch:smoke:local -- --applicationId=<id> [--approvedTailoringRunId=<id>] [--actorLabel=<label>] [--skipMigrate]

What it does:
  1. Runs db:migrate:deploy unless --skipMigrate is set
  2. Enqueues prepare_application_workspace for the application
  3. Drains the Latch queue once
  4. Prints application status with payloads
  5. Prints recent queue state

Current success criteria:
  - task reaches the real Latch boundary
  - task leaves queued state and records a typed terminal result
  - depending on branch state, that may be a bridge-stage failure or a completed/blocked agent response
EOF
}

for arg in "$@"; do
  case "$arg" in
    --applicationId=*)
      application_id="${arg#*=}"
      ;;
    --approvedTailoringRunId=*)
      approved_tailoring_run_id="${arg#*=}"
      ;;
    --actorLabel=*)
      actor_label="${arg#*=}"
      ;;
    --skipMigrate)
      skip_migrate=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$application_id" ]]; then
  echo "Missing required --applicationId=<id>" >&2
  usage >&2
  exit 1
fi

echo "==> Latch smoke start applicationId=$application_id actorLabel=$actor_label"

if [[ "$skip_migrate" -eq 0 ]]; then
  echo "==> Applying Prisma migrations"
  npm run db:migrate:deploy
else
  echo "==> Skipping migrations (--skipMigrate)"
fi

echo "==> Enqueueing Latch task"
if [[ -n "$approved_tailoring_run_id" ]]; then
  npm run latch:ops:local -- enqueue "--applicationId=$application_id" "--approvedTailoringRunId=$approved_tailoring_run_id" "--actorLabel=$actor_label"
else
  npm run latch:ops:local -- enqueue "--applicationId=$application_id" "--actorLabel=$actor_label"
fi

echo "==> Draining queue once"
npm run latch:queue:once:local

echo "==> Application status"
npm run latch:ops:local -- status "--applicationId=$application_id" --includePayloads

echo "==> Recent queue"
npm run latch:ops:local -- queue --limit=5 --includePayloads

echo "==> Smoke complete"
echo "Check the printed status for a typed terminal result. While the real lane is still settling, bridge-stage failures are acceptable if the task crossed queued -> processing and wrote the failure cleanly." 
