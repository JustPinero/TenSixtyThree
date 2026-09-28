# Phase 58 — Drift + debt sweep (docs, dead tests, dead weight, ledger)

Everything from the 09-18 audit that is cleanup, not behavior.

## 58.1 — Delete the tautological tests ([1.0.D2])
Nine of ten files under app/api/__tests__/ assert membership in a local
Set they built themselves and import no route (dispatch.test.ts:14-22,
playbook.test.ts:34-37, projects.test.ts:96-114, …). Keep
feature-proposals.test.ts (imports the route). Delete the rest; where a
route has NO other coverage, write one real route test in its own folder.
Also fix app/api/demo/route.test.ts:41-49 (hard-codes the single-proxy
model) to assert the x-client-ip path.

## 58.2 — Docs drift
- references/schema.md:333-369 + architecture.md:84: Team/Membership/Invite
  + lib/teams.ts are DELETED (e88dfd1) → mark removed-in-1.0.
- lib/env-manifest.ts:48, .env.example:17, references/env-vars.md:15:
  BETTER_AUTH_URL is https://www.tensixtythree.com; railway.app = origin.
- README.md:221-230 + architecture.md:13: hosting = Cloudflare edge →
  Railway; link deployment-landmines Cloudflare section.
- env-manifest: add `runner-only` scope for RUNNER_MODE/RUNNER_ID/
  RUNNER_POLL_MS/RUNNER_MAX_TURNS/RUNNER_MAX_BUDGET_USD/GITHUB_TOKEN and
  `ops-only` for CLOUDFLARE_API_TOKEN; /api/health reports per scope.
- references/api-contracts.md: add /api/brains, /api/dispatch/status,
  /api/observability/quarantine, /api/settings/model, /api/usage/summary,
  /api/auth/[...all].

## 58.3 — Debt ledger (audits/debt.md)
Log with the audit's IDs: [1.0.D6] CI dead (closed by 57.2), [1.0.D7]
__Secure- cookie (closed by 57.1), [1.0.D8] KickoffTemplate never seeded on
hosted (DECISION: seed vs local-only), [1.0.D9] two Postgres services on
Railway (dump + two-key consent before delete), [1.0.D10] runner
GITHUB_TOKEN is Justin's personal OAuth token → fine-grained PAT,
[1.0.D11] dead Railway API token in 1Password → delete item, confirm
RAILWAY_TOKEN unset, [1.0.D12] proxy-aware IP (closed by 56.1),
[1.0.D13] origin bypass (closed by 56.1).

## 58.4 — Dead weight
- rm e2e-manifest.json (root, unreferenced, all not-started).
- docs/cascade-2.0-team-direction.md → docs/archive/ with a header noting
  the Phase-48 team layer was retired in 1.0 (the collision-plane thesis
  still stands — keep the doc, move it).
- scripts/validate-env.sh cannot fail → either assert hosted-required
  vars when RAILWAY_ENVIRONMENT is set, or delete and rely on /api/health.

## AC → tests
- 58.1: `pnpm test` file count drops by 9; every deleted file's route has
  ≥1 real test somewhere (script asserts app/api/**/route.ts ↔ *.test.ts).
- 58.2: drift-audit skill passes on schema.md + architecture.md;
  env-manifest scope test covers every var in .env.example (existing
  manifest test extended).
- 58.3: debt.md entries exist with IDs (grep in a test is overkill —
  reviewer check).
- 58.4: validate-env.sh exits 1 when a hosted-required var is missing
  under RAILWAY_ENVIRONMENT (shell test), or the script is gone.
