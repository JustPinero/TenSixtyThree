# Phase 59 — [51.D1] `prisma db push` → `prisma migrate` baseline

The trigger fired at 1.0: hosted Postgres holds real rows and
railway.json preDeploy runs `prisma db push`, which drops+adds on a
rename and aborts non-interactively on a type change. Do this BEFORE the
next schema change (58.2's env work touches no schema; 57/56 touch none).

## 59.1 — Baseline
- `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma
  --script > prisma/migrations/0_init/migration.sql`; `prisma migrate
  resolve --applied 0_init` against hosted (via /api/admin/ops or a one-shot
  Railway run — NOT railway ssh with piped stdin).
- Verify: `prisma migrate status` clean on hosted and on the dev container.
## 59.2 — Pipeline
- railway.json preDeploy → `pnpm exec prisma migrate deploy`.
- tests/harness/global-setup.ts: template DB built by `migrate deploy`
  (not db push) so tests exercise the real migration chain.
- CLAUDE.md + .claude/rules/db.md + references/schema.md: the command
  changes from `db push` to `migrate dev` locally / `migrate deploy` hosted.
## 59.3 — Safety
- Backup before the first `migrate deploy` on hosted: verified pg_dump
  (nonzero, listed) per the Destructive Actions Protocol.
- Destructive-migration guard: CI step runs `prisma migrate diff` between
  main and the branch and fails on DROP unless the migration file contains
  `-- allow-destructive`.

## AC → tests
- 59.1: `prisma migrate status` exit 0 on a fresh template DB (harness test).
- 59.2: global-setup builds the template via migrate deploy (assert the
  `_prisma_migrations` table exists with 1+ rows in a rig test).
- 59.3: guard script test — a migration containing DROP without the marker
  fails; with the marker passes.
