# Prisma + Postgres Rules (Phase 51 — hosted foundation)

- The database is **Postgres** everywhere: local dev + tests run against the
  `tensixtythree-pg` Docker container (`postgres:16`, `127.0.0.1:51063`,
  `docker-compose.dev.yml`). The old SQLite `./dev.db` is retired (kept on disk
  as a legacy backup; `scripts/migrate-dev-db.ts` was its one-way exit).
- Sync schema with `pnpm exec prisma db push` + `pnpm exec prisma generate`.
  After ANY schema change also delete nothing — tests build their template DB
  per run (`test_rig_template` database, created by vitest globalSetup).
- JSON is stored as `String` columns and parsed manually (legacy convention;
  migrate to native `Json` deliberately, not incidentally).
- **Postgres has real concurrency** — SQLite's single writer no longer saves
  you. Find-or-create flows need advisory locks (`pg_advisory_xact_lock`) and
  read-modify-write flows need `SELECT ... FOR UPDATE` (see lib/chat-session.ts).
- Tests: per-rig databases are template clones (`CREATE DATABASE ... TEMPLATE`),
  serialized by advisory lock 1063. Legacy test files run through the compat
  alias in vitest.config (`@prisma/adapter-better-sqlite3` → pg shim).
- After any schema change, update `references/schema.md` to match.
