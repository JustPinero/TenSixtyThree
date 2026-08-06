# Phase 51 — Hosted Foundation: Decision Record (2026-08-06)
Justin's call: TenSixtyThree goes HOSTED. ("Let's get hosting this already.")

- **Architecture: hosted control plane + local runners.** Dashboard/Teams/knowledge/
  activity in the cloud; dispatch stays on operator machines phoning home via the
  authed webhook ([42.D1] secret). Cloud Agent-SDK runners = Phase 52.
- **Auth: Better Auth** (self-hosted, TS-first) + **GitHub OAuth primary, Google
  secondary, magic-link fallback. No passwords.** DB-backed revocable sessions.
  Organization plugin replaces hand-rolled Team/Membership/Invite internals
  (our domain services in lib/teams.ts stay as the seam).
- **Domains: tensixtythree.com primary** (app at app.tensixtythree.com),
  10-63.com 301s to it. Justin purchasing both.
- **DB: Postgres everywhere** (prod parity in dev + tests). Local dev via Docker
  (postgres:16, port 51063). Test rig moves file-copy → CREATE DATABASE TEMPLATE.
- **Host: Railway** (app + Postgres) — existing account/tooling.

## Slices
- 51.1 Postgres migration (this branch): provider swap, adapter-pg, pragma gating,
  rig rework, suite green. 51.1b: dev.db → Postgres data migration script.
- 51.2 Better Auth + OAuth. 51.3 Teams on org plugin. 51.4 Railway deploy + domain.
