# Request loop reference

## Where things live
- `requests/phase-N-slug/PHASE.md` — the request. Acceptance criteria are
  under "AC → tests".
- `.claude/handoff.md` — current state. **Gitignored**, so it never arrives
  via a clone; read it from disk.
- `audits/debt.md` — open debt with IDs (`[1.0.D1]`, `[51.D1]`, ...).
- `references/` — architecture, schema, deployment landmines, env vars,
  API contracts. Imported by CLAUDE.md.

## Gate commands
| Purpose | Command |
|---|---|
| Full gate (what CI runs) | `bash scripts/validate.sh` |
| Tests only | `pnpm test` |
| Types | `pnpm exec tsc --noEmit` |
| Lint | `pnpm lint` |
| Local database up | `docker start tensixtythree-pg` |

## Test harness
Database-backed tests use `createDispatchRig()` from
`tests/harness/dispatch-rig.ts`, which clones the `test_rig_template`
database over an in-process connection. Do not add new files on the
`@prisma/adapter-better-sqlite3` compat alias — it is a shim over a retired
driver, tracked as `[1.0.D1]`.

## Phases currently queued
56 edge hardening (blocked on a production deploy), 57 auth and CI,
58 drift and debt sweep, 59 migrate baseline, 60 remaining 1.0 debt,
61-63 theme, accessibility and UI (largely delivered).
