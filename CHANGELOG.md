# Changelog

All notable changes to TenSixtyThree (1063) are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow [SemVer](https://semver.org/). Phase numbers in parentheses map to
`requests/` and the decision log in `references/architecture.md`.

## [1.0.0] — 2026-09-15

First cut release. Everything below 1.0 was the 0.x modernization arc
(Phases 1–50, April–July 2026); 1.0 is the hosted product.

### Added
- **Hosted foundation (51.x)** — Postgres everywhere (Prisma 7 +
  `@prisma/adapter-pg`, local Docker container, hosted Railway Postgres);
  Better Auth identity on the organization plugin; `lib/env-manifest.ts` +
  `/api/health` for deploy checks; Railway config and runbook.
- **Cloud runner (52.x)** — a second Railway service that claims queued
  `runtime: "cloud"` dispatches (`SELECT … FOR UPDATE SKIP LOCKED`, stale
  requeue, 5-minute lease heartbeat), clones the repo credential-free, runs
  a Claude Agent SDK session as an unprivileged `tsagent` uid with
  allowlisted env and path-scoped file tools, pushes `cloud/<id>` and opens
  a PR. Honors project autonomy (`manual` is refused as unattendable).
  Live cloud-dispatch panel on project pages; OPS_SECRET-gated
  `/api/admin/ops` for headless operations against the private DB.
- **Theme packs (53.x)** — 12 prebuilt assistant personas with matching
  themes, Leonardo-generated portraits, voice defaults, themed chimes, a
  sidebar quick-switcher; persona block reaches the Overseer prompt and
  per-project `themeKey`.
- **Lockdown (54.1–54.2)** — invite-only sign-up (gate on user creation,
  `ADMIN_EMAILS` bootstrap), edge route guard, email-code sign-in with
  password-after-first-login, GitHub/Google OAuth; Resend email with
  console fallback; AES-256-GCM crypto box; BYOK Anthropic keys sealed at
  rest and used by all three chat routes.
- **Organizations (54.3, 55)** — create/switch orgs, shared-project grid,
  typed feed (goal / objective / bug / test-request / note), member
  invites with auto-accept on sign-in, admin invites panel, per-project
  tenancy (`ownerUserId` + visibility matrix in `lib/project-access.ts`).
- **Boards & roadmap (54.4)** — kanban boards (dnd-kit), tickets with
  priority/assignee/milestone, milestones on `/roadmap`, Linear import
  with a sealed org key and idempotent sync.
- **Demo mode (54.5–54.6)** — public "Try the demo" sandbox (seeded org,
  boards, feed; 2-hour session; 24-hour sweep; canned Overseer replies at
  the choke points) with a persona-guided, cross-page spotlight tour.

### Changed
- Test harness: per-worker rig databases with TRUNCATE reset (suite ~3×
  faster, contention flakes gone); DB URLs default to `127.0.0.1` (IPv6
  SSL flake).
- Dashboard resolves project visibility once before the fan-out; advisory
  probes run in parallel; Linear sync batched (was ~3 queries per issue);
  org routes share one `activeOrgContext` resolver.
- Rate limiter keys on the LAST `x-forwarded-for` hop; demo minting has a
  global hourly cap in addition to the per-IP cap.

### Fixed
- Org project share accepted any project id regardless of the caller's
  access (IDOR) — now requires `canSeeProject`.
- Runner terminal writes are conditioned on still owning the claim; a
  runner that lost its lease no longer overwrites another's result.
- Milestones re-verify org membership (stale `activeOrganizationId`).
- `/api/admin/ops enqueue-cloud` honors the manual-autonomy refusal.
- Demo detection reads the persisted `isDemo` flag, not just the email
  pattern; agent-user provisioning no longer caches a transient failure.

### Removed
- Phase-48 single-team layer (`lib/teams`, `lib/team-activity`,
  `/api/team*`, team forms) — superseded by multi-org.
- `/api/kilroy-channel` (unreachable), SQLite pragmas, migration scripts
  (`migrate-dev-db`, `backfill-chat-sessions`), eight orphan lib modules,
  `@dnd-kit/sortable`, `CASCADE_KNOWLEDGE_DIR`.
- `.test-manifest/` and ops drafts are no longer tracked (repo is public).

### Known debt
See `audits/debt.md` — [51.D1] `db push` → `migrate` baseline is the first
post-1.0 chore; [1.0.D1–D5] cover the SQLite-shim test migration,
tautological `app/api/__tests__`, dashboard server-component refactor,
dispatch-event lookup, and symlink-aware tool scoping.

## [0.1.0] — 2026-07-30

Modernization arc complete: debt ledger zeroed, 1,302 tests, Sonnet 5,
Teams UI, Brains. Local-first only (SQLite). Superseded by 1.0.
