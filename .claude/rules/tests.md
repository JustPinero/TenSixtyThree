---
paths:
  - "**/*.test.*"
---
# Test Rules (Vitest + Playwright)

- TDD is not optional: business logic, API routes, services, and utilities get failing tests FIRST from acceptance criteria, then implementation until green. UI components may test-after, but tests must exist before the request is complete.
- Every acceptance criterion in a request maps to a specific test. When all pass, the request is done.
- Run with `pnpm test` (Vitest). Full gate is `scripts/validate.sh` — the same script CI runs.
- Tests that need a database use `createDispatchRig()` from `tests/harness/dispatch-rig.ts`, which clones the `test_rig_template` Postgres database over an in-process connection and tears it down in `dispose()`. **SQLite is retired** (Phase 51); the compat alias and its helpers were removed in phase 60.1 and tests/harness/no-sqlite.test.ts keeps them out. Never touch the live database; a subprocess that needs the database (e.g. the seed script) gets `rig.dbUrl`.
- Never run two Vitest processes at the same time (e.g. a targeted run while `validate.sh` is going). They collide on the shared template database and advisory lock 1063, producing failures that look like real regressions.
- No `any`, no `@ts-ignore`, no `as unknown as` — strict mode applies to test files too.
- Mock external boundaries (Anthropic API, `gh`/`op` shell-outs, filesystem scans of other projects); don't hit real services in unit tests.
