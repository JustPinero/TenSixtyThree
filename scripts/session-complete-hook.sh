#!/usr/bin/env bash
#
# Cascade — canonical Stop-hook webhook client (Phase 41.5).
#
# Managed projects' .claude/settings.json Stop hook invokes this script
# (via scripts/install-hooks.ts) after saving the session log. It POSTs
# the session-complete payload to Cascade's webhook; if the server is
# unreachable (dev server down, `op` signed out, port closed), it spools
# the payload as a JSON line so the server can drain it later. No Stop-
# hook ping is lost.
#
# Runs SYNCHRONOUSLY — it must wait for curl to know whether to spool.
# The install-hooks command backgrounds the whole invocation with `&`,
# so the Claude session never blocks on it.
#
# Usage: session-complete-hook.sh <projectPath> [port]
#
# Environment:
#   CASCADE_DISPATCH_ID    idempotency key round-tripped to the webhook
#                          so it can correlate the Stop hook to its
#                          originating Dispatch row (optional)
#   CASCADE_PORT           port fallback when arg 2 is omitted (default 3000)
#   CASCADE_WEBHOOK_SPOOL  spool file path
#                          (default ~/.cascade/webhook-spool.jsonl —
#                          outside any repo by design)

set -u

project_path="${1:-$PWD}"
port="${2:-${CASCADE_PORT:-3000}}"
spool="${CASCADE_WEBHOOK_SPOOL:-$HOME/.cascade/webhook-spool.jsonl}"

# Build the JSON payload. idempotencyKey is included only when
# CASCADE_DISPATCH_ID is set (pre-23.2 sessions carry no key and the
# webhook falls back to its legacy correlation path).
# [41.D2] — build the payload with jq when available so paths containing
# quotes/backslashes can't produce malformed JSON (which would 400 -> spool
# -> quarantine -> silently dropped ping). Raw interpolation remains as the
# no-jq fallback (safe for the plain absolute paths this fleet uses).
if command -v jq >/dev/null 2>&1; then
  if [ -n "${CASCADE_DISPATCH_ID:-}" ]; then
    payload=$(jq -cn --arg p "$project_path" --arg k "$CASCADE_DISPATCH_ID" '{projectPath: $p, idempotencyKey: $k}')
  else
    payload=$(jq -cn --arg p "$project_path" '{projectPath: $p}')
  fi
else
  if [ -n "${CASCADE_DISPATCH_ID:-}" ]; then
    payload="{\"projectPath\":\"${project_path}\",\"idempotencyKey\":\"${CASCADE_DISPATCH_ID}\"}"
  else
    payload="{\"projectPath\":\"${project_path}\"}"
  fi
fi

# Attempt the POST. `-f` makes curl exit non-zero on an HTTP error
# response; a refused/timed-out connection also exits non-zero. Short
# timeouts keep a Stop hook from hanging on a black-holed port.
# [42.D1] — send the shared secret when configured (matches the route's check)
secret_file="$HOME/.cascade/webhook-secret"
secret_header=()
if [ -r "$secret_file" ]; then
  secret_header=(-H "x-cascade-webhook-secret: $(tr -d '\n' < "$secret_file")")
fi

if curl -s -f --connect-timeout 3 --max-time 10 ${secret_header[@]+"${secret_header[@]}"} \
  -X POST "http://localhost:${port}/api/webhook/session-complete" \
  -H 'Content-Type: application/json' \
  -d "${payload}" >/dev/null 2>&1; then
  exit 0
fi

# POST failed — spool the payload for the server to drain later. A
# single printf of a short line under an O_APPEND fd is atomic on POSIX,
# so concurrent Stop-hook writers don't interleave.
mkdir -p "$(dirname "${spool}")"
printf '%s\n' "${payload}" >>"${spool}"
exit 0
