# Environment Variables

Source of truth: `lib/env-manifest.ts` (`ENV_MANIFEST`). The inventory test in `lib/env-manifest.test.ts` pins that list to the actual `process.env.*` reads in `app/`, `lib/`, and `scripts/` — when you add a var, extend the manifest and this table together. `.env.example` is generated from the same list.

Scopes:
- **hosted-required** — the hosted control plane cannot boot (or cannot auth) without it. Railway deploys must set all of these.
- **hosted-optional** — enables a feature on the hosted instance; absence degrades gracefully.
- **local-only** — only meaningful on an operator machine with a filesystem fleet (PROJECTS_DIR scans, dispatcher shell-outs, Stop-hook spool).

| Name | Scope | Description |
|------|-------|-------------|
| `DATABASE_URL` | hosted-required | Postgres connection string (Railway: reference the attached Postgres service). |
| `ANTHROPIC_API_KEY` | hosted-required | Claude API key for the Overseer chat and briefing engines. |
| `BETTER_AUTH_SECRET` | hosted-required | Better Auth signing secret (`openssl rand -base64 32`; never reuse the local one in prod). |
| `BETTER_AUTH_URL` | hosted-required | Public base URL of the deployment (`https://<app>.up.railway.app` until the domain lands). |
| `AUTH_REQUIRED` | hosted-required | Set `"true"` on hosted instances to enforce sessions; unset/false is local single-user mode. |
| `ENCRYPTION_KEY` | hosted-required | 54.2 — 32-byte base64 secret sealing BYOK Anthropic keys at rest (`openssl rand -base64 32`). Rotating it orphans stored keys (users re-enter). |
| `ADMIN_EMAILS` | hosted-required | 54.1 — comma-separated bootstrap allowlist: these emails may create accounts without an invite and land with the admin role. Without it, an invite-only instance has no way in. |
| `GITHUB_CLIENT_ID` | hosted-required | GitHub OAuth App client id (primary sign-in provider). |
| `GITHUB_CLIENT_SECRET` | hosted-required | GitHub OAuth App client secret. |
| `RESEND_API_KEY` | hosted-optional | 54.2 — Resend API key for invite/OTP email. Unset: emails are logged to the server console instead (dev/local mode). |
| `OPS_SECRET` | hosted-optional | 52.3 — enables the headless operator ops endpoint (`/api/admin/ops`, constant-time compared). Unset: endpoint 404s. |
| `EMAIL_FROM` | hosted-optional | 54.2 — From header for auth email. Default `"TenSixtyThree <auth@mail.tensixtythree.com>"`. |
| `GOOGLE_CLIENT_ID` | hosted-optional | Google OAuth client id (secondary sign-in provider). |
| `GOOGLE_CLIENT_SECRET` | hosted-optional | Google OAuth client secret. |
| `CASCADE_CHAT_MODEL` | hosted-optional | Override the Overseer chat model id (defaults in code). |
| `CASCADE_AI_SERVICE` | hosted-optional | Select the AI service implementation (default: anthropic). |
| `VERCEL_TOKEN` | hosted-optional | Enables the Vercel deployment panels/integrations. |
| `RAILWAY_TOKEN` | hosted-optional | Enables the Railway deployment panels/integrations. |
| `ANTHROPIC_FEATURE_SOURCES` | hosted-optional | Comma list of sources for the version watcher's feature-proposal feed. |
| `PROJECTS_DIR` | local-only | Root directory of the local project fleet for health/progress scans. |
| `KILROY_BRAIN_PATH` | local-only | Path to the shared kilroy-brain repo checkout. |
| `CASCADE_PLUGIN_JSON_PATH` | local-only | Path to the coqui-kickoff plugin manifest. |
| `CASCADE_CLAUDE_CONFIG_PATH` | local-only | Path to the operator's `~/.claude` config for hook installs. |
| `CASCADE_MAX_CONCURRENT_SUBAGENTS` | local-only | Cap on concurrently dispatched Claude Code sessions. |
| `CASCADE_WEBHOOK_SECRET_PATH` | local-only | File path holding the Stop-hook webhook shared secret. |
| `CASCADE_WEBHOOK_SPOOL` | local-only | Spool directory for webhook payloads when the app is down. |
| `CASCADE_PORT` | local-only | Local dev server port override used by hook installers. |
| `TEST_PG_BASE_URL` | local-only | Test-harness Postgres base URL (vitest rigs only). |

## Runner service (not in the manifest)

These are read only by `scripts/runner.ts` / `lib/runner/real-deps.ts` on the `tensixtythree-runner` Railway service and have no effect on the app service:

| Name | Default | Description |
|------|---------|-------------|
| `RUNNER_MODE` | unset | `1` makes `pnpm start` / `pnpm start:hosted` exec `scripts/runner.ts` instead of `next start`. This is how the runner service boots from the same repo. |
| `RUNNER_ID` | `<hostname>-<pid>` | Identity stamped on claimed `Dispatch` rows (`runnerId`). |
| `RUNNER_POLL_MS` | `5000` | Poll interval for queued cloud dispatches. |
| `RUNNER_MAX_TURNS` | `40` | Agent SDK max turns per run. |
| `RUNNER_MAX_BUDGET_USD` | `5` | Agent SDK spend cap per run; budget stops are salvaged into `Dispatch.costUsd`. |
| `GITHUB_TOKEN` | unset | Runner only: private clones, `cloud/<id>` branch pushes, PR creation via GitHub REST. Passed per-command, never persisted in `.git/config`. Use a fine-grained PAT scoped to the dispatchable repos. |

## Notes

- **`/api/health` reports `missingEnv`.** `GET /api/health` (unauthenticated — Railway probes it anonymously) runs `validateHostedEnv(process.env)` and returns `{ status, db, missingEnv, warnings }`. `missingEnv` lists every `hosted-required` var that is unset; `warnings` includes a line whenever `AUTH_REQUIRED` is not `"true"` (expected in local mode). HTTP status is driven by the DB probe only: 200 `ok`/`up`, 503 `degraded`/`down` — a missing env var shows in the payload but does not by itself flip the status.
- **`ADMIN_EMAILS` is the bootstrap for an invite-only instance.** Sign-up is gated by `lib/invite-gate.ts` (Better Auth `user.create.before`). Emails on this list may create an account with no invite and land as `admin`; everyone else needs a `UserInvite` (`POST /api/admin/invites`, admin-only) or a pending org `Invitation`. Without `ADMIN_EMAILS`, a fresh hosted instance has no way to create its first admin.
- **`ENCRYPTION_KEY` rotation orphans stored keys.** `lib/crypto-box.ts` (AES-256-GCM) seals `User.anthropicKeyEnc` (BYOK) and `Organization.linearKeyEnc`. Ciphertext written under the old key cannot be opened under a new one — users must re-enter their Anthropic key (`PUT /api/account/anthropic-key`) and orgs their Linear key (`PUT /api/orgs/linear`).
- **`RUNNER_*` only matter on the runner service.** The app service never reads them; setting them there is harmless but does nothing. The runner service needs `DATABASE_URL` and `ANTHROPIC_API_KEY` (same Postgres as the app) plus `RUNNER_MODE=1`.
- `ANTHROPIC_API_KEY` must NEVER reach client-side code. BYOK keys (`resolveAnthropicKey`: user key wins, else the app key) are likewise server-only.
- Local dev: all vars live in `.env` (gitignored), loaded by `op run --env-file=.env -- next dev`. Secret values use `op://Cascade/...` references resolved by the 1Password CLI; non-secret values are plain strings. `DATABASE_URL` stays a literal (`postgresql://tensixtythree:tensixtythree@127.0.0.1:51063/tensixtythree`, the `tensixtythree-pg` Docker container).
- Runtime-set, not user-configured: `CASCADE_DISPATCH_ID` (set by the local dispatcher, equal to `Dispatch.idempotencyKey`; the Stop hook posts it back to `/api/webhook/session-complete`), `NODE_ENV`, `CI`.
