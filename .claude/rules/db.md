---
paths:
  - "prisma/**"
  - "lib/db.ts"
  - "lib/**/*rig*"
  - "tests/harness/**"
  - "**/*.test.ts"
  - "scripts/**"
---
# Prisma + Postgres Rules (Phase 51 — hosted foundation)

- The database is **Postgres** everywhere: local dev + tests run against the
  `tensixtythree-pg` Docker container (`postgres:16`, `127.0.0.1:51063`,
  `docker-compose.dev.yml`). The old SQLite `./dev.db` is retired (kept on disk
  as a legacy backup; `scripts/migrate-dev-db.ts` was its one-way exit).
- **Schema changes are migrations (Phase 59).** Edit `prisma/schema.prisma`,
  then `pnpm db:migrate --name <change>` (= `prisma migrate dev`) to write
  `prisma/migrations/<ts>_<change>/migration.sql`, then `prisma generate`.
  Never `db push` against a migrated database. Hosted runs
  `prisma migrate deploy` in the web service preDeploy. Tests build their
  template DB per run with `migrate deploy` (`test_rig_template`, vitest
  globalSetup), and a drift test fails if schema.prisma has changes no
  migration covers.
- **Destructive migrations** (DROP TABLE/COLUMN/TYPE, column type change,
  TRUNCATE, DELETE) fail `pnpm db:check-migrations` (validate.sh + CI) unless
  the file has `-- allow-destructive: <why>` — and hosted gets a verified
  `pg_dump` first (Destructive Actions Protocol).
- JSON is stored as `String` columns and parsed manually (legacy convention;
  migrate to native `Json` deliberately, not incidentally).
- **Postgres has real concurrency** — SQLite's single writer no longer saves
  you. Find-or-create flows need advisory locks (`pg_advisory_xact_lock`) and
  read-modify-write flows need `SELECT ... FOR UPDATE` (see lib/chat-session.ts).
- Tests: per-rig databases are template clones (`CREATE DATABASE ... TEMPLATE`),
  serialized by advisory lock 1063. That lock is SESSION-scoped, so the
  drop and the create must share ONE `psql` invocation — splitting them
  across two processes releases the lock between them and reintroduces
  the flakiness fixed in [1.0.D1] (see references/deployment-landmines.md). Legacy test files run through the compat
  alias in vitest.config (`@prisma/adapter-better-sqlite3` → pg shim).
- After any schema change, update `references/schema.md` to match.
