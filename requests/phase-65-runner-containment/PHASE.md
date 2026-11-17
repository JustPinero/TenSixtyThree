# Phase 65 — Cloud runner containment

Source: 2026-11-16 deep review (R1-R3, R9-R12, S8, S9, R19). The uid drop is
sound; what surrounds it is not. No schema change. After 64.

## 65.1 — Credentials never ride in a URL, argv, or stored text
- Clone/push authenticate via `http.extraHeader` supplied through
  `GIT_CONFIG_COUNT/KEY/VALUE` env (or `GIT_ASKPASS`); remote URLs are
  credential-free.
- `scrubSecrets()` applied to every string written to `Dispatch.errorMessage`,
  `ActivityEvent`, PR bodies, and logs.
- `/api/dispatch/cloud/[id]` and `/api/dispatch/status` return an explicit
  field allowlist (no `idempotencyKey`, no raw error text beyond the scrubbed
  summary).
## 65.2 — The privileged process never executes anything from the agent's tree
- After the agent exits, export its commits (`git bundle` run as the agent
  uid) and push from a fresh privileged clone; OR run all post-agent git as
  the agent uid with `core.hooksPath=/dev/null`, `core.fsmonitor=false`,
  `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, and no
  `safe.directory` override.
- Refuse to push changes under `.github/workflows/` unless the project
  opts in.
## 65.3 — One job leaves nothing for the next
- Per job: fresh HOME + TMPDIR (removed in `finally`), `settingSources: []`,
  `persistSession: false`; after the job, kill every process owned by the
  agent uid. Clone failure removes its temp dir.
## 65.4 — Who may dispatch, and on whose key
- `canDispatchProject` / `canEditProject` (owner or admin; org members only
  when the share grants it) replace `canSeeProject` for cloud dispatch and
  for PATCH (`autonomyMode` especially). Re-check autonomy at claim time.
- Per-user rate limit + one active run per (user, project); enqueue button
  disabled while pending.
- Non-admin cloud runs require the user's own key; the app key is never
  placed in an agent environment. BYOK decrypt failure = hard error, not a
  silent fallback.
## 65.5 — Config that fails loudly
- Runner env (`RUNNER_*`, `GITHUB_TOKEN`, `ENCRYPTION_KEY`) added to
  `lib/env-manifest.ts` with a runner scope; boot refuses on a non-numeric
  budget/turn limit. Hosted webhook requires a configured secret and can
  only transition `runtime: "local"` rows.

## AC → tests
- 65.1: clone failure fixture → stored errorMessage contains no token and no
  `@github.com` userinfo; unit test for `scrubSecrets`; route tests for the
  field allowlists.
- 65.2: integration test with a temp repo whose `.git/hooks/pre-commit`,
  `pre-push` and `core.fsmonitor` each touch a sentinel file → sentinel never
  created by the push step. Workflow-file diff → push refused.
- 65.3: job test asserts HOME/TMPDIR removed and `settingSources: []`,
  `persistSession: false` passed to the SDK.
- 65.4: permission matrix tests (owner / org member / org admin / admin /
  demo) for dispatch + PATCH; second enqueue while one is active → 409;
  no-BYOK non-admin → 402-style refusal; agent env snapshot never contains
  the app key.
- 65.5: env-manifest test covers runner vars; NaN budget → boot throws.
