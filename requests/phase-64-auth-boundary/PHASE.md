# Phase 64 — Auth boundary: deny by default

Source: 2026-11-16 deep review (S1, S2, S3, F4/S12, S16; details in the
local review notes). Middleware is an optimistic cookie-presence gate by
design; the real check must happen in every route. Today it does not.
FIRST in the queue. No schema change — does not wait on phase 59.

## 64.1 — One server-only access helper, used everywhere
- `lib/access.ts` (`import "server-only"`): `requireUser(request)` →
  `{ user, isDemo, isAdmin }` or throws a typed 401; `requireAdmin`,
  `requireNonDemo`, `requireLocalMode` (403 `{ error, hostedUnsupported:
  true }` when `AUTH_REQUIRED === "true"`). React `cache()` so one request
  verifies once.
- Every `app/api/**/route.ts` handler starts with exactly one of these or is
  listed in an explicit `PUBLIC_ROUTES` allowlist (health, demo mint,
  auth/*, admin/ops, webhook).
- Delete the dead `requireSession`; update the comments in
  lib/route-guard.ts / lib/auth-helpers.ts that promise a re-check.
## 64.2 — "local" comes from configuration, never from a missing session
- `lib/project-access.ts`: viewer kind `local` only when
  `AUTH_REQUIRED !== "true"`; null user under AUTH_REQUIRED → 401.
- `lib/anthropic-key.ts`: no app-key fallback for a null user when hosted.
## 64.3 — Local-only surfaces refuse on hosted
- Filesystem/shell routes (`projects/launch`, `projects/scan`, `harvest*`,
  `playbook` PUT, `brains`, `integrations/*`, `hooks/*`, `dispatch` local,
  `dispatch/all`, `engineer-channel`, `settings/model` PATCH unless admin)
  → `requireLocalMode` or `requireAdmin`.
- `projects/launch`: validate name + slug with `isValidSlug`; resolved path
  must be inside PROJECTS_DIR.
## 64.4 — Demo sessions are read-mostly
- `requireNonDemo` on org create / invite / share / linear, settings writes,
  briefing (demo gets a canned briefing — no model call), account/password.
- Org invites: per-user rate limit; an invitation only satisfies the invite
  gate when the inviter is a non-demo user.
## 64.5 — Error hygiene
- Shared `jsonError(error)`: log server-side, return a generic message; no
  raw `error.message` / Prisma detail in responses. Unknown `/api/*` → JSON 404.

## AC → tests
- 64.1: `lib/route-auth-coverage.test.ts` walks `app/api/**/route.ts` and
  fails on any exported handler that neither calls a `require*` helper nor
  is in `PUBLIC_ROUTES`. Route tests: every non-public route → 401 with no
  cookie AND with a syntactically valid but unknown cookie.
- 64.2: project-access unit tests for (AUTH_REQUIRED × user null/user/admin/demo).
- 64.3: each local-only route → 403 hostedUnsupported under AUTH_REQUIRED;
  launcher rejects `..`, absolute paths, and names outside the slug charset.
- 64.4: demo session → 403 on each listed write; invite-gate test: demo
  inviter's invitation does not permit account creation.
- 64.5: a thrown Prisma error yields a body with no model/constraint names.
