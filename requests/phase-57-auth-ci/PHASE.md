# Phase 57 — Auth correctness + CI resurrection

Two CRITICALs from the 09-18 audit that predate Cloudflare.

## 57.1 — `__Secure-` session cookie in lib/auth-helpers.ts
Better Auth prefixes the cookie with `__Secure-` whenever baseURL is https
(node_modules/better-auth/dist/cookies/index.mjs:21). auth-helpers.ts:24
matches only the bare name → every `requireSession`/`getServerSession`
route (25 call sites) 401s real accounts on hosted; demo works only because
app/api/demo/route.ts sets the bare name. middleware.ts already checks both.
- tokenFromHeaders: accept `__Secure-better-auth.session_token` first, then
  the bare name (mirror Better Auth's getCookie order).
- Prefer delegating to `auth.api.getSession({ headers })` if it returns the
  same shape without a second query; otherwise keep the manual lookup.
- Demo route: set the prefixed name when BETTER_AUTH_URL is https so demo
  and real sessions share one code path.
- Live verification: sign in on www with a real account → GET /api/orgs 200.

## 57.2 — CI is dead (red on every main push since July)
- .github/workflows/ci.yml: remove `version: 10` from pnpm/action-setup
  (packageManager field wins; the action refuses both).
- Add a `postgres:16` service to test/scenario jobs on 127.0.0.1:51063
  matching docker-compose.dev.yml creds; DATABASE_URL accordingly.
- e2e job: drop `DATABASE_URL=file:./test-e2e.db` (SQLite retired) → pg.
- Make CI == scripts/validate.sh (lint, tsc, prisma generate, test, build);
  remove the redundant scenario job (already inside `pnpm test`).
- Branch protection: require CI green on main (Justin's click, GitHub UI).

## 57.3 — Email-send observability
lib/email.ts never throws; a Resend 4xx logs one console line that Railway
retains for minutes, and the UI still says "code sent".
- sendEmail returns `{sent:false, error}` → callers in lib/auth.ts throw an
  APIError so Better Auth returns 5xx and the page shows a real error.
- Persist a `email.failed` ActivityEvent (kind, to-domain only, status)
  so /api/admin/ops can surface it.

## AC → tests
- 57.1a tokenFromHeaders: prefixed wins over bare; bare still works; both
  present → prefixed; signature suffix stripped → unit test.
- 57.1b route rig test: session cookie set with the `__Secure-` name →
  requireSession resolves the user (regression for the 401).
- 57.1c demo route: cookie name matches `auth`'s computed prefix.
- 57.2: a push to a branch runs CI green (observed, not unit-tested); CI
  runs the same commands as validate.sh (diff the two in a script test).
- 57.3a sendVerificationOTP with a failing sendEmail → thrown APIError →
  endpoint 5xx (route test with mocked fetch).
- 57.3b ActivityEvent row written on failure (rig test).
