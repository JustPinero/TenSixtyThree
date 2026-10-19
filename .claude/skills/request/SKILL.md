---
name: request
description: Run a TenSixtyThree request file through the full action loop — Prime, Plan, Red, Green, Validate. Use when starting or continuing work on a file in requests/, or when the user names a phase or request number. Enforces tests-first and the definition of done.
user-invocable: true
argument-hint: "[phase or request, e.g. 59 or phase-59-migrate-baseline]"
---

# Request action loop

CLAUDE.md states this loop in prose. Following it reliably is the point of
this skill: the failure mode it prevents is implementing first and
back-filling tests, which has happened here before.

## 1. Prime
- Read the request file under `requests/` (`$1` names the phase, if given).
- Read `.claude/handoff.md` — the single current-state doc. It is gitignored
  and local-only, so it is the only place some context exists.
- Read `audits/debt.md` for anything the request touches.
- Check `knowledge/` before solving something novel; this fleet has solved a
  lot already.

## 2. Plan
State, briefly: the files to create or modify, and a mapping from each
acceptance criterion to the specific test that will prove it. If a
criterion has no test that could fail, the criterion is not yet real —
sharpen it before writing code.

## 3. Red — tests first, not negotiable
Write the failing tests first for business logic, API routes, services and
utilities. Run them and **confirm they fail for the stated reason**, not
because of a typo or a missing import. A test that was never red proves
nothing.

UI components and exploratory work may implement first, but say out loud
that you are using that escape hatch, and the tests still land before the
request is done.

## 4. Green
Implement until the tests pass. Commit at logical checkpoints with the
`type(scope): description` format. Do not broaden scope mid-request; log
what you find to `audits/debt.md` instead.

## 5. Validate
Run `scripts/validate.sh` — the same gate CI runs.

Two standing hazards:
- **Never run a second Vitest process while the gate is running.** They
  collide on the shared template database and the 1063 advisory lock, and
  the resulting failures look exactly like real regressions. This has
  wasted hours.
- **A local green run is weak evidence on a memory-tight machine.** If the
  suite fails in files backed by the SQLite compat alias, check free memory
  and `[vitest-pool]: Failed to start forks worker` before believing it is
  your change. CI on a dedicated runner is the trustworthy signal.

## Done
All acceptance criteria met with passing tests, `scripts/validate.sh`
green, `references/` updated if a schema or API contract moved,
`.claude/handoff.md` updated, and any new debt logged with an ID. Then
state the next request number.
