#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JOBSPY_SERVER_ENTRY_DEFAULT="$ROOT_DIR/legacy/source-job-search-workspace/mcp/vendors/jobspy-mcp-server/src/index.js"
JOBSPY_SERVER_ENTRY_FALLBACK="/Users/clawbot/.openclaw/workspace/job-search/mcp/vendors/jobspy-mcp-server/src/index.js"
JOBSPY_SERVER_ENTRY="${JOBSPY_SERVER_ENTRY:-$JOBSPY_SERVER_ENTRY_DEFAULT}"
if [[ ! -f "$JOBSPY_SERVER_ENTRY" ]] && [[ -f "$JOBSPY_SERVER_ENTRY_FALLBACK" ]]; then
  JOBSPY_SERVER_ENTRY="$JOBSPY_SERVER_ENTRY_FALLBACK"
fi
JOBSPY_HTTP_PORT="${JOBSPY_HTTP_PORT:-9943}"
JOBSPY_MCP_URL_DEFAULT="http://127.0.0.1:${JOBSPY_HTTP_PORT}"
JOBSPY_MCP_URL="${JOBSPY_MCP_URL:-$JOBSPY_MCP_URL_DEFAULT}"
JOBSPY_START_SERVER="${JOBSPY_START_SERVER:-1}"
JOBSPY_READY_TIMEOUT_SECONDS="${JOBSPY_READY_TIMEOUT_SECONDS:-30}"
JOBSPY_LOG_FILE="${JOBSPY_LOG_FILE:-${TMPDIR:-/tmp}/jobspy-mcp-gateway.log}"

args=("$@")
has_trigger=0
for arg in "${args[@]}"; do
  if [[ "$arg" == --trigger=* ]]; then
    has_trigger=1
    break
  fi
done
if [[ $has_trigger -eq 0 ]]; then
  args+=("--trigger=scheduled")
fi

jobspy_pid=""
cleanup() {
  if [[ -n "$jobspy_pid" ]] && kill -0 "$jobspy_pid" 2>/dev/null; then
    kill "$jobspy_pid" 2>/dev/null || true
    wait "$jobspy_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_port() {
  local port="$1"
  local deadline=$((SECONDS + JOBSPY_READY_TIMEOUT_SECONDS))
  while (( SECONDS < deadline )); do
    if nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

if [[ "$JOBSPY_START_SERVER" == "1" ]]; then
  if [[ ! -f "$JOBSPY_SERVER_ENTRY" ]]; then
    echo "JobSpy MCP server entry not found: $JOBSPY_SERVER_ENTRY" >&2
    exit 1
  fi

  ENABLE_SSE=1 JOBSPY_PORT="$JOBSPY_HTTP_PORT" node "$JOBSPY_SERVER_ENTRY" >"$JOBSPY_LOG_FILE" 2>&1 &
  jobspy_pid=$!

  if ! wait_for_port "$JOBSPY_HTTP_PORT"; then
    echo "Timed out waiting for JobSpy MCP HTTP server on port $JOBSPY_HTTP_PORT" >&2
    echo "Last log output:" >&2
    tail -50 "$JOBSPY_LOG_FILE" >&2 || true
    exit 1
  fi
fi

cd "$ROOT_DIR"
JOBSPY_MCP_URL="$JOBSPY_MCP_URL" npm run scout:run:local -- --provider=jobspy-mcp "${args[@]}"
