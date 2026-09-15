# Test Audit — Full Codebase (deep mode)

Date: 2026-09-15
Scope: entire repo at `/Users/justinpinero/Desktop/projects/Cascade`, pinned to
commit `b9be130` (`fix(54.1): never gate /.well-known/`), branch `main`, clean
working tree.

**Caveat on methodology:** mid-audit, `git log -1` briefly surfaced a
different HEAD (`3ceeae0 feat(55): green — ...`) before settling back on
`b9be130`, consistent with another agent/session actively working this same
tree concurrently (per your own `feedback_agents_survive_restarts` note —
"never two agents on one tree"). I re-verified the final state (`git status`
clean, `git rev-parse HEAD` = `b9be130`) before writing this report and all
findings below are pinned to that commit. If phase 55 has since merged,
re-run the `app/api/projects/[slug]` and `app/api/orgs/invite` sections
specifically — those are exactly the surfaces phase 55 touches.

## Suite health
- `pnpm test`: **1,516 passed, 4 skipped, 1 failed suite (1,520 total)**,
  244 test files, ~34s wall / 232s test time.
- The one failure was `lib/overseer-tools-session-logs.test.ts`, which failed
  on `pushTestSchema`'s `psql` connection during `DROP DATABASE ... WITH
  (FORCE)` under the phase-52 advisory-lock serialization
  (`lib/__test-utils__/prisma-push.ts:29`):
  ```
  psql: error: connection to server at "localhost" (::1), port 51063 failed:
  received invalid response to SSL negotiation:
  ```
  Re-running that single file in isolation passed in 2s. This is a **real,
  reproduced flake**, not a one-off fluke of my environment — see Finding F1.
- 4 skipped tests are gated by `templatesAvailable` in
  `lib/template-seed.test.ts:22` (environment-conditional skip, not test
  debt — legitimate).
- No `.skip(`/`.todo(`/`expect(true).toBe(true)` tautologies found anywhere
  in the suite via direct grep — the tautology problem here is subtler (see
  Finding F3): tests that pass but never touch the code under test at all,
  rather than tests that trivially can't fail.

## Grade: B-

**What's genuinely good:** the phase 51+ rig harness
(`tests/harness/dispatch-rig.ts`, `createDispatchRig`) is well-built —
real Postgres per test, advisory-lock-serialized template cloning, proper
session/org/board fixtures, and it's used correctly across ~40+ newer route
tests (boards, orgs, admin, dispatch/cloud, webhook, auth) with genuine
happy+sad+stranger-403/404 path coverage. Security-sensitive logic
(`lib/invite-gate.ts`, `tests/scenarios/shell-escape-verifier.test.ts`,
`lib/validators.test.ts`) is well isolated and specifically tested, including
an explicit "architecture invariant" test for shell-injection defense that's
above the bar I'd expect.

**What holds it to B-/C+ territory:** ~40% of `app/api/**/route.ts` handlers
(30 of 70) are never imported by any test — including the Railway healthcheck
endpoint, the public unauthenticated demo endpoint, the 1Password secrets
integration, and the AI wizard-chat endpoint. Separately, 8 of the 9 legacy
`app/api/__tests__/*.test.ts` files give the *appearance* of route coverage
(their filenames match route groups) but never call the route handler at
all — several of their assertions are provably tautological (Finding F3).
That's a coverage-integrity problem, not just a coverage-completeness one:
someone scanning "does `/api/dispatch` have a test file?" would get a false
yes.

---

## Finding 1 — Route handlers with NO test coverage at all

Verified by grepping every test file in the repo for an import of each
route's exact path (not just a filename match), so this excludes the
"business logic only" files that share a name but never touch the handler
(those are Finding 3).

**Confirmed zero coverage (no test anywhere imports the route file):**

| Route | Lines | Why it matters |
|---|---|---|
| `app/api/health/route.ts` | 24 | **Railway healthcheck target** (Phase 51.4 deploy prereq per handoff.md). Thin wrapper over `lib/health-check.ts` (which *is* tested), but the route's own HTTP status mapping (`result.httpStatus`) and JSON shape are never asserted. |
| `app/api/demo/route.ts` | 29 | **Public, unauthenticated**, rate-limited (3/hr/IP), mints a real session + cookie. Phase 54.5's own PHASE.md/`54.5-demo-mode.md` AC4 explicitly requires `app/api/demo/route.test.ts` — it does not exist. `lib/demo.test.ts` covers `seedDemo`/`cleanupDemo` but not the route's cookie-setting, rate-limit-429, or sweep-trigger wiring. |
| `app/api/demo/status/route.ts` | 10 | Powers the demo banner; trivial but untested. |
| `app/api/integrations/onepassword/route.ts` | 91 | Talks to the 1Password CLI / secrets. Security-adjacent, zero tests. |
| `app/api/integrations/auth/route.ts` | 58 | OAuth-adjacent integration route, zero tests. |
| `app/api/integrations/github/route.ts` | 41 | Zero tests. |
| `app/api/integrations/deploy-status/route.ts` | 33 | Zero tests. |
| `app/api/wizard/chat/route.ts` | 132 | AI chat endpoint (project-creation wizard). Its sibling `app/api/overseer/chat/route.ts` has **5** dedicated test files (tools, feature-check, feature-propose streaming, etc.); wizard/chat has **0**. Large asymmetry for comparable risk (LLM tool-calling, streaming, cost). |
| `app/api/tasks/route.ts` | 172 | Full CRUD (GET/POST/PATCH/DELETE), zero tests. |
| `app/api/hooks/validate/route.ts` | 130 | Validates incoming Claude Code hook payloads. Zero tests. |
| `app/api/engineer-channel/route.ts` | 97 | `lib/engineer-channel.ts` (the logic) is well tested; the route itself (auth, request parsing, response shape) is not. |
| `app/api/kilroy-channel/route.ts` | 66 | Appears to be **dead code**: superseded by `engineer-channel` per `requests/phase-8-public-ready/8.2-engineer-channel.md:24` ("Update app/api/kilroy-channel/route.ts → app/api/engineer-channel/route.ts"), and no `app/`/`components/` file references it. Zero tests. Recommend confirming it's unused and deleting rather than testing it. |
| `app/api/orgs/linear/route.ts` | 87 | The only org sub-route *not* covered by `app/api/orgs/route.test.ts` (that file's `load()` helper imports `route`, `active/route`, `posts/route`, `projects/route` — but not `linear/route`). Handles `Organization.linearKeyEnc` (a secret). |
| `app/api/overseer/history/route.ts` | 84 | Zero tests. Low-complexity GET but no validation test for a malformed `date` query param. |
| `app/api/playbook/suggestions/route.ts` | 43 | Zero tests (base `app/api/playbook/route.ts` has business-logic-only coverage — see Finding 3). |
| `app/api/knowledge/gaps/route.ts`, `harvest/route.ts`, `harvest-history/route.ts`, `search/route.ts` | 14/18/73/56 | All four zero tests at the handler level. `knowledge/route.ts` (base) has business-logic-only coverage (Finding 3); these four sub-routes have *nothing*, not even that. |
| `app/api/advisories/generate/route.ts` | 18 | Zero tests. Rate-limited POST, thin wrapper. |
| `app/api/attention/route.ts` | 31 | Zero tests. Thin wrapper. |
| `app/api/dispatch/all/route.ts`, `dispatch/batch/route.ts` | 40/71 | `app/api/__tests__/dispatch.test.ts` exists and has a matching name, but never imports either route (Finding 3) — mode-validation logic is duplicated/hand-copied into the test instead. `tests/scenarios/batch-resilience.test.ts` does exercise `dispatchBatch` from `lib/claude-dispatcher.ts` directly, so the underlying dispatcher logic for batch *is* covered — just not the `dispatch/all`/`dispatch/batch` route handlers (request parsing, response shape, auth). |
| `app/api/projects/scan/route.ts` | 47 | Zero tests. |
| `app/api/projects/[slug]/route.ts` — **GET** | (178 total) | Only `route.themekey.test.ts` exists, and it covers **PATCH themeKey only**. GET (project detail) is completely untested at the route level. Given Phase 55's `PHASE.md` explicitly lists "55.2b routes enforce `canSeeProject` (404 for strangers) → route test" as an acceptance criterion for this exact file, and `canSeeProject`/`visibleProjectFilter` (`lib/project-access.ts`) are currently only unit-tested (`lib/project-access.test.ts`) with zero route-level assertion (`grep canSeeProject` across all `*.test.ts` returns exactly one file), this is the audit's highest-priority single gap if phase 55 work is landing on `main`. |
| `app/api/projects/[slug]/chat/route.ts`, `sessions/route.ts`, `work/route.ts` | 146/44/45 | Zero tests. |

**Note — routes I initially suspected were untested but are actually fine**
(same-named string appeared in grep, but a real import confirmed coverage):
`boards/[id]/route.ts`, `feature-proposals/[id]/route.ts`,
`milestones/route.ts`, `tickets/route.ts` (all four covered via
`app/api/boards/route.test.ts`'s multi-route `load()` helper), and
`orgs/active|posts|projects/route.ts` (covered via `app/api/orgs/route.test.ts`).

---

## Finding 2 — `lib/` modules with no test coverage

Cross-checked every top-level and one-level-nested `lib/*.ts` file against
every `*.test.ts` in the repo (not just co-located files, since this project
often puts coverage in a differently-named file).

- **`lib/observability/tool-call-events.ts`** (84 lines) — genuinely zero
  coverage anywhere. Sibling files in the same directory
  (`usage-events.ts`, `usage-summary.ts`) both have dedicated tests;
  this one doesn't.
- **`lib/runner/real-deps.ts`** (343 lines, the largest untested-ish file in
  the repo) — only `classifyToolUse` (one export) is exercised, via
  `lib/runner/classify.test.ts`. The rest of the file — shallow git clone,
  Agent SDK stream wiring, `resolveAnthropicKey` BYOK-vs-app-key precedence,
  scratch-dir cleanup, `cloneUrl` token injection — has no test. This is
  production code for cloud dispatch (Phase 52); the comment at the top
  notes it's dynamically imported "only `scripts/runner.ts` walks this
  path," which likely explains why it's been easy to skip — but that also
  means it's the least-exercised path in CI.
- `lib/auth-client.ts` (17 lines) — trivial client wrapper, no material
  risk, fine to leave untested (test-after escape valid per CLAUDE.md).
- `lib/test-helpers.ts` (31 lines) — test infrastructure itself, not
  product code; no test needed.
- Everything else initially flagged (`lib/auth-client.ts`, `lib/auth.ts`,
  `lib/dispatch-liveness.ts`, `lib/file-utils.ts`) turned out to have
  either direct or clearly-adequate indirect coverage once traced through
  actual imports (e.g. `lib/dispatch-liveness.ts` via
  `lib/dispatch-watchdog.liveness.test.ts`).
- **`lib/auth.ts`** (158 lines, the Better Auth server config — Phase 54.1
  Lockdown: `disableSignUp`, `databaseHooks.user.create.before` →
  `decideUserCreation`, OTP rate limits, admin plugin) is declarative
  wiring, and its core decision function (`decideUserCreation`) is
  thoroughly unit-tested in `lib/invite-gate.test.ts`. But **no test proves
  the wiring itself** — that a real sign-up attempt through the mounted
  `app/api/auth/[...all]/route.ts` is actually rejected for a
  non-invited email. The only route-level test
  (`app/api/auth/[...all]/route.test.ts`) is a single assertion:
  `expect(res.status).toBeLessThan(500)` on an anonymous GET. For a
  security-lockdown feature this critical, an end-to-end "POST
  sign-up/email for a non-invited address → 4xx, no user row created"
  test through the real mounted handler would catch a regression that
  the current tests structurally cannot (they test the gate function in
  isolation, and the route in isolation, but never the composition).

---

## Finding 3 — Tautological tests / tests that never touch the code under test

This is the most consequential finding in the audit: **8 of the 9 files in
`app/api/__tests__/`** are named after route groups (`dispatch.test.ts`,
`knowledge.test.ts`, `playbook.test.ts`, `projects.test.ts`,
`reminders.test.ts`, `reports.test.ts`, `templates.test.ts`,
`activity.test.ts`) and each contains the header comment `// Test the
business logic that API routes depend on directly` — but **none of them
import the route handler they're named after**. They construct a raw
Prisma client against a per-file SQLite-shim database and assert on Prisma
query results directly. This gives a false positive when scanning "does
`/api/X` have a test" (it looks like it does), while providing zero
coverage of request parsing, auth/session checks, HTTP status codes, or
response shape for the actual route.

Two concrete, provable tautologies inside these files (assertions that
construct their own expected values inline and then check them against
themselves, with zero connection to the app's real validation code):

- `app/api/__tests__/dispatch.test.ts:14-21` —
  ```ts
  it("validates dispatch modes", () => {
    const VALID_MODES = new Set(["continue", "audit", "investigate", "custom"]);
    expect(VALID_MODES.has("continue")).toBe(true);
    ...
  ```
  and `dispatch.test.ts:37-43` ("dispatch-all only accepts continue and
  audit modes") — same pattern. If `app/api/dispatch/all/route.ts` or
  `dispatch/batch/route.ts`'s actual allowed-mode list drifts from this
  hand-copied `Set`, this test gives no signal either way. (Two other
  tests in the same file, `validates slug before dispatch` and `validates
  project path before dispatch`, *do* call the real `isValidSlug`/
  `isInsideProjectsDir` from `lib/validators` — those are legitimate.)
- `app/api/__tests__/projects.test.ts:96-115` — `describe("PATCH field
  validation")` builds `VALID_STATUS`/`VALID_HEALTH`/`VALID_AUTONOMY` as
  local `Set`s inside the test and checks membership against itself. Zero
  connection to whatever validation `app/api/projects/[slug]/route.ts`'s
  PATCH handler actually performs.
- `app/api/__tests__/knowledge.test.ts:59` ("search rejects queries over
  200 chars") — worth double-checking whether this calls
  `app/api/knowledge/search/route.ts` (it does not — that route has zero
  test coverage per Finding 1) or a local length check.

By contrast, `app/api/__tests__/feature-proposals.test.ts` in the same
directory *does* it right — it `await import("@/app/api/feature-proposals/
route")` and calls the real `GET`/`PATCH` exports (lines 66, 76, 85, 93,
107, 123, 133, 142, 155, 172, 187). That file should be the template the
other 8 are brought up to, not the exception.

**Practical effect:** `app/api/dispatch/all`, `dispatch/batch`,
`app/api/knowledge/gaps|harvest|harvest-history|search`,
`app/api/playbook/suggestions`, `app/api/reports/generate`, and
`app/api/projects/[slug]` GET+PATCH-validation are all *effectively*
untested at the HTTP boundary, despite each having a same-named test file
that would make a coverage dashboard look green.

---

## Finding 4 — SQLite-era relic tests: intentional, documented, NOT accidental debt

`grep -rl "adapter-better-sqlite3"` across the repo returns **47 test
files** (plus `vitest.config.ts` and the shim itself). This is *not* an
oversight — `.claude/rules/db.md` and the shim's own header comment
(`lib/__test-utils__/pg-file-url-compat.ts:1-19`) both document it
explicitly:

> "Phase 51.1 — SQLite→Postgres COMPAT LAYER for the ~48 legacy test files
> that hand-construct `new PrismaBetterSqlite3({ url: "file:/...x.db" })`...
> This is transitional: new tests should use tests/harness/dispatch-rig.ts.
> Migrating legacy files off the shim is tracked in phase-51 follow-ups."

`vitest.config.ts` aliases `@prisma/adapter-better-sqlite3` →
`pg-file-url-compat.ts`, which derives a deterministic
`test_rig_c_<hash>` Postgres database name from the old file path and
returns a real `PrismaPg` adapter. So these 47 files *do* run against real
Postgres today — they're not silently testing against a stale SQLite
engine, they're just using an old *API shape* (file-URL construction)
routed through a shim. Functionally correct; stylistically stale.

**Can they be retired?** Not by deletion — they contain real test cases
with no duplicate elsewhere. The honest framing is "migrate," not "retire":
rewrite each file's setup boilerplate (`new PrismaBetterSqlite3(...)` +
`pushTestSchema(fileUrl)` + manual `fs.unlinkSync` cleanup) to
`createDispatchRig()` from `tests/harness/dispatch-rig.ts`, which is
already the pattern used by all Phase 52+ tests and is strictly less code
per file. This is mechanical, low-risk, high-volume work — good candidate
for a dedicated cleanup phase rather than folding into a feature phase.
I did not find any of the 47 files silently failing or masking a bug via
the shim; the one live bug the shim setup produces is Finding 1 below
(flaky `localhost` DNS), which is orthogonal to the SQLite-vs-Postgres
question.

Two files inside the shim/harness layer itself should also route through
`createDispatchRig` rather than raw `psql`, but that's a bigger refactor
(`prisma-push.ts` currently shells out to `psql` directly under an
advisory lock) — flagging, not requesting, given Finding 1 is the more
urgent fix to that exact code path.

---

## Finding 5 — Flaky-prone patterns

**F1 — `localhost` vs `127.0.0.1` DNS ambiguity under concurrent DB
teardown (reproduced empirically this session).** The Postgres container
is published as `127.0.0.1:51063` (confirmed via `docker port
tensixtythree-pg` → `5432/tcp -> 127.0.0.1:51063`), and both `CLAUDE.md`
and `.claude/rules/db.md` document the port as `127.0.0.1:51063`
specifically. But every connection-string default in the test/db layer
uses the hostname `localhost` instead:
  - `lib/db.ts:11`
  - `lib/__test-utils__/pg-file-url-compat.ts:25`
  - `tests/harness/dispatch-rig.ts:68`
  - `tests/harness/global-setup.ts:22`
  - `prisma/seed.ts:8`

  On this machine `localhost` resolves IPv6-first (`::1`), and the
  container isn't bound there. Under vitest's default thread-pool
  concurrency (12 workers on this 12-core machine), the 47 legacy files'
  `psql ... DROP DATABASE ... WITH (FORCE)` calls (serialized behind
  advisory lock 1063, per `.claude/rules/db.md`) queue up and, under load,
  I captured exactly this failure mid-suite:
  ```
  psql: error: connection to server at "localhost" (::1), port 51063 failed:
  received invalid response to SSL negotiation:
  ```
  This is a genuine, reproducible flake source, not theoretical — it's
  the one failure in an otherwise-clean 1,520-test run. **Fix is
  mechanical:** change the five defaults above from `localhost` to
  `127.0.0.1` (or set `TEST_PG_BASE_URL`/`DATABASE_URL` explicitly in CI),
  which matches what the project's own docs already claim is the address.

- **F2 — advisory-lock contention scales with legacy-file count, not
  test count.** Every one of the 47 shimmed files pays a `DROP DATABASE`
  + `CREATE DATABASE ... TEMPLATE` round-trip under a single global
  advisory lock (`SELECT pg_advisory_lock(1063)`) on every run, serialized
  regardless of vitest's worker parallelism. This is a throughput/flake
  surface that grows linearly with legacy-file count and shrinks as
  Finding 4's migration proceeds (rig-based tests share the lighter
  worker-scoped TRUNCATE-reset path added in `perf(52.6)` per the commit
  log — `ccd9450`). Not an immediate bug, but worth knowing the two
  findings (F1 DNS default, F2 lock contention) compound each other: more
  concurrent `psql` connections to a misdirected hostname = more chances
  to hit F1.
- No sleep-based/`setTimeout`-based real-timer waits were found in any
  test file outside of `vi.useFakeTimers()` contexts — that specific flake
  pattern is absent from this codebase, which is a positive finding worth
  stating explicitly rather than leaving as a silent non-finding.

---

## Prioritized fix list

1. **[Critical-ish, cheap]** Pin `localhost` → `127.0.0.1` in the 5 files
   listed under F1. Five one-line changes, directly explains the one
   flake reproduced this session, and aligns the code with what the
   project's own docs already assert.
2. **[High]** Add a real route-level test for `app/api/demo/route.ts`
   (Phase 54.5's own AC4 already requires this and it's missing) —
   public, rate-limited, session-minting endpoint with zero handler
   coverage.
3. **[High]** Add a real route-level test for `app/api/health/route.ts`
   (Railway healthcheck target) and `app/api/projects/[slug]/route.ts`
   GET (especially the `canSeeProject`/tenancy-visibility composition,
   which Phase 55's own PHASE.md lists as AC 55.2b and which currently
   has zero route-level assertion anywhere in the suite).
4. **[High]** Fix or replace the 8 tautological `app/api/__tests__/*`
   files (Finding 3) — either rewrite them to import and call the real
   route handlers (template: `feature-proposals.test.ts` in the same
   directory), or explicitly rename/scope them as "business logic smoke
   tests" and add genuine route tests alongside. As written they create
   false confidence for `dispatch/all`, `dispatch/batch`,
   `knowledge/gaps|harvest|harvest-history|search`,
   `playbook/suggestions`, and `reports/generate`.
5. **[Medium]** Cover `app/api/wizard/chat/route.ts` — closest analog
   (`overseer/chat`) has 5 dedicated test files; this has zero.
6. **[Medium]** Cover `app/api/integrations/onepassword/route.ts` and
   the other 3 integrations routes — secrets-adjacent, currently
   untested.
7. **[Medium]** Add an end-to-end auth-lockdown test: POST
   `sign-up/email` for a non-invited address through the real mounted
   `app/api/auth/[...all]/route.ts` → expect rejection, no user row.
   Proves the `databaseHooks` wiring, not just `decideUserCreation` in
   isolation.
8. **[Low]** Confirm `app/api/kilroy-channel/route.ts` is genuinely dead
   (superseded by `engineer-channel` per the phase-8 request) and delete
   it rather than write tests for it.
9. **[Low]** `app/api/orgs/linear/route.ts`, `app/api/tasks/route.ts`,
   `app/api/hooks/validate/route.ts`, `app/api/overseer/history/route.ts`,
   `app/api/projects/[slug]/chat|sessions|work/route.ts`,
   `app/api/projects/scan/route.ts` — round out remaining untested
   routes.
10. **[Low, scheduling]** Plan a dedicated cleanup phase to migrate the
    47 `adapter-better-sqlite3`-shimmed files onto
    `tests/harness/dispatch-rig.ts` (Finding 4) — already tracked as
    debt in the shim's own comments, this audit just re-confirms scope
    (47 files) and that it's safe (no masked bugs found).
11. **[Low]** `lib/observability/tool-call-events.ts` and the untested
    surface of `lib/runner/real-deps.ts` (only `classifyToolUse` is
    covered out of ~343 lines) — cloud-dispatch production code with
    thin coverage.

Files written by this audit: this report only
(`audits/test-audit-full-2026-09-15.md`). No fix-request files were
written — given the volume and cross-cutting nature of the findings
(several touch phase-55-in-flight work), I'm returning the prioritized
list above for you to route rather than pre-splitting into
`requests/phase-N-fixes/*.md` against a phase that may already be moving
under you. Say the word if you want them split into individual request
files against a specific phase number.
