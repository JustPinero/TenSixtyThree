# Phase 60 — Remaining 1.0 debt: test rig migration + architecture

Lower urgency; do after 56–59. Each item is independent and can be its own
PR.

## 60.1 — [1.0.D1] 47 tests off the SQLite→pg compat alias
File-by-file: replace `@prisma/adapter-better-sqlite3` imports with the
rig (`createDispatchRig` / template clone); delete
lib/__test-utils__/pg-file-url-compat.ts and the vitest alias when the
count hits zero. Order: lib/ first (pure), then app/api.
## 60.2 — [1.0.D3] dashboard → server component
app/(dashboard) fetches visibility + fleet on the server; client islands
only for chat/SSE and drag. Drops the double round-trip on first paint.
## 60.3 — [1.0.D4] ActivityEvent.dispatchId column
Add `dispatchId String? @index`; backfill from the JSON substring; replace
the LIKE lookup in lib/dispatch-outcomes (or wherever it lives). First
schema change after 59 → proves the migrate pipeline.
## 60.4 — [1.0.D5] realpath in classifyToolUse
Resolve symlinks before the containment check (PROJECTS_DIR guard) so a
symlinked project path can't escape classification.
## 60.5 — Test-quality nits from the audit
lib/anthropic-feature-check.audit.test.ts:105,117 exact sets instead of
`>3`/`<3`; lib/scanner.test.ts:84-95 stop mutating the shared fixture.

## AC → tests
- 60.1: `grep -rl adapter-better-sqlite3 --include=*.test.ts` → 0; alias
  removed from vitest.config; full suite green.
- 60.2: dashboard page has no "use client"; a server-render test asserts
  projects are in the HTML without a client fetch.
- 60.3: migration applies via migrate deploy in the harness; lookup test
  uses the column; backfill script test.
- 60.4: symlink escape test (tmp dir with a symlink outside PROJECTS_DIR →
  classified as outside).
- 60.5: the two tests assert exact values / fresh fixtures.
