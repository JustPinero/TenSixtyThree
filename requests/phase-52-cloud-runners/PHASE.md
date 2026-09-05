# Phase 52 — Cloud runners (Agent SDK)

Research brief 2026-09-05 (agent, sources in transcript): the Claude Agent
SDK (@anthropic-ai/claude-agent-sdk) runs long-lived in a Node worker —
query() yields a typed SDKMessage stream (assistant text, tool_use, hook
events, terminal `result` with total_cost_usd/usage), replacing tmux log
parsing + Stop-hook webhooks entirely for cloud runs. Guardrails: maxTurns,
maxBudgetUsd, allowedTools deny rules, AbortController. Billing: API tokens
(subscription headless credit drains first since 2026-06-15). Architecture:
second always-on Railway service (serverless sleeps — unusable), clone-per-
job into a scratch dir, push branch/PR; Railway Sandboxes are the later
per-tenant isolation upgrade; Claude Code Routines = operator-only escape
hatch (per-routine tokens, fire-and-forget, experimental).

## MVP flow
Hosted dispatch click → Dispatch row (runtime "cloud", status queued) →
runner service claims it (FOR UPDATE SKIP LOCKED) → clones the project's
GitHub repo → Agent SDK query with the dispatch prompt (cwd=clone,
maxTurns/maxBudgetUsd) → every SDKMessage upserts ActivityEvent /
lifecycle rows (result message = today's Stop-hook equivalent, writes
DispatchOutcome) → push phase branch → row completed with cost.

## Slices
- 52.1 Core (this sitting): Dispatch.runtime column ("local" default |
  "cloud"); lib/runner/claim.ts (atomic claim, SKIP LOCKED, stale-claim
  requeue); lib/runner/lifecycle.ts (pure SDKMessage→row mapping, cost/
  usage extraction, outcome classification reusing escalation signals);
  POST /api/dispatch/cloud (session + canSeeProject gated, org
  attribution, demo refused); runner loop scripts/runner.ts (injectable
  SDK + git, --once mode for tests/smoke).
- 52.2 Integration: real @anthropic-ai/claude-agent-sdk + shallow clone +
  branch push (GitHub App/installation token decision with Justin),
  Railway second service (railway add), BYOK key per dispatch owner.
- 52.3 UI: cloud-dispatch button on shared projects, live event feed from
  the runner rows, cost display.
