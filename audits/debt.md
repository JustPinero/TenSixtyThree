# Technical Debt Log

## Open

- **[51.D1]** (2026-08-06) Hosted schema sync uses `prisma db push` via
  Railway `preDeployCommand` — no migrations directory, no rollback story.
  Acceptable while the hosted DB holds no irreplaceable data; convert to
  `prisma migrate` (baseline + migration files) before real production data
  accumulates. Trigger: first external user, or first schema change after
  launch, whichever comes first.

*(empty — ledger zeroed 2026-07-30. Five former entries were promoted to the
roadmap in `audits/modernization-plan-2026-07.md` § Promoted-from-debt because
they are feature slices, not defects: [23.D1] eval recordings, [23.D2] team-
dispatch lifecycle rearchitecture, [23.D4] real-log escalation corpus,
[Theme Pack], [36.A5] server-side chat persistence, [30.D2-residual]
opportunistic route tests.)*

## Resolved
### RESOLVED 2026-07-30 (debt-zero pass)
- **[41.D10]** Absolute-path `cd` prefixes removed from CON-CORE / medipal / romereno formatter hooks (committed + pushed in each repo); fleet-wide sweep found no others.
- **[41.D1]** Docstring corrected to state the true guarantee (loss bounded to a microsecond TOCTOU window; lockfile deferred until multi-writer reality).
- **[41.1-residual]** globalSetup now sweeps leftover `test-rig-*.db` before workers spawn — back-to-back runs start clean.
- **[36.A7]** dispatchClaude enforces the same readiness gate as batch (RED→GREEN; the "blocked on rig" premise was false — batch tests already solve it with fs mocks, now shared).
- **[23.D6]** Legacy "latest session-launched event" outcome fallback REMOVED — its own telemetry criterion was met (zero orphaned-webhook events since 2026-04-14). Outcome data is now exclusively Dispatch-row-correlated; key-less manual sessions still release slots and produce signals/lessons, but no longer fabricate misattributed outcome rows. Two tests flipped to the new contract.



### RESOLVED 2026-07-30 (phase-47 continuation)
- **[41.D4]** signal-loop writes guarded (try/catch, non-fatal log) — a transient DB error can no longer abort ingest post-completion.
- **[41.D5]** brain-sync collisions disambiguated by frontmatter-title hash suffix; same-title re-harvests still overwrite in place (regression-tested both ways).
- **[41.D6]** publish-safety now reports every distinct match per pattern (global exec loop, dedup by redacted value).
- **(47.3)** Structured outputs on harvester + feature-check — regex-JSON fallbacks retired; schema-enforced {lessons}/{candidates}.

### RESOLVED 2026-07-30 (phase-46 hardening)
- **[42.D1]** Webhook shared-secret auth SHIPPED: `lib/webhook-auth.ts` (constant-time compare), route requires `x-cascade-webhook-secret` whenever `~/.cascade/webhook-secret` exists; canonical hook script sends it; `install-hooks.ts` generates it (0600). Backward compatible (no file = open). No fleet re-roll needed — all projects call the canonical `$HOME/.cascade` script.
- **[41.D2]** Hook payload now built with `jq -n --arg` when jq is present (raw-interpolation fallback otherwise).
- **[41.D3]** Trust-map parse cached per (path, mtime) in `readWorkspaceTrustCached` — scan/briefing/webhook paths share one parse.
- **[41.D7]** `lib/webhook-ingest.test.ts` added (direct contract: containment rejection + in-tree resolution).
- **[41.D8]** Missing-spool drain no-op covered in `lib/webhook-quarantine.test.ts`.
- **[40.D1]** Stale entry: already fixed in phase 41.3 (fake timers in deadline-utils.test.ts). Closed on audit.
- **(46.1)** Quarantine surfaced: `readQuarantineStatus` + `/api/observability/quarantine` + dashboard banner.


### [41.D9] Fleet webhook-hook rollout cross-machine path portability — RESOLVED 2026-07-07 (fix-41.D9)
Option (a) landed. `buildWebhookCommand` now emits a `$HOME`-relative script reference (`bash "$HOME/.cascade/session-complete-hook.sh" "$PWD" <port> > /dev/null 2>&1 &`) — no absolute `/Users/...` path — so a committed, cross-machine-synced `settings.json` hook resolves on every machine (`$HOME` expands per-machine inside the double-quoted command). New `copyCanonicalScript({home?, sourcePath?})` (home/source injectable for tests) installs `scripts/session-complete-hook.sh` → `<home>/.cascade/session-complete-hook.sh`, overwriting so updates propagate, `chmod 0755`. `processProject` copies before writing project settings; `instrumentation.ts` copies on server boot (next to the spool-drain wiring), wrapped so a copy failure never throws into startup — a freshly-cloned machine self-heals. `isCascadeStopHook` still matches the new command (contains `session-complete`) so an old absolute/inline Cascade Stop hook is replaced in place, no duplicate entry. 6 acceptance tests in `scripts/install-hooks.test.ts`; suite 179 files / 1222 tests green; validate.sh passes. Fleet rollout (`install-hooks.ts` across all 22 projects) is now SAFE to run — NOT run in this fix.

### [23.D5] Watchdog scheduling — RESOLVED 2026-06-11 (Phase 35)
`instrumentation.ts` starts the watchdog on a 5-minute in-process interval at server boot (`lib/dispatch-watchdog-runtime.ts`); the `predev` npm script sweeps once before `next dev`. Singleton-guarded across HMR; NODE_ENV=test no-op.

### [36.A1] Queue-slot release keyed by project.path — RESOLVED 2026-06-11 (Phase 37)
Queue jobs are now keyed by the Dispatch `idempotencyKey`: same-project dispatches hold distinct slots, and webhook/watchdog releases can't miss on path byte-differences. Key-less (legacy) hooks release the newest in-flight row's key as a fallback. Boot reconciliation (`reconcileOrphanedDispatches`) fails rows still `queued` at process start ([36.A2]). Deliberately NOT changed: a slot is still held for the session's lifetime — release-on-spawn would redefine what concurrency means (launch-rate vs running-sessions) and is a product decision; revisit if wanted.

### [30.D2] HTTP-boundary test gap (top-5 routes) — RESOLVED 2026-06-09 (Phase 33)
Top-5 mutating routes from the original audit finding now have route-level tests, plus `lib/dispatch-lifecycle.ts` (Phase 23.2 core path) has direct tests:
- `lib/dispatch-lifecycle.test.ts` (7 tests) — queued/started/failed transitions, idempotencyKey uniqueness, expectedBy honoring.
- `app/api/projects/launch/route.test.ts` (7 tests) — validation 400s, happy path, defaults, error surfaces.
- `app/api/projects/[slug]/dispatch/route.test.ts` (8 tests) — mode validation, slug 404, happy path with activity event + currentRequest write, rate-limit, custom-mode prompt threading.
- `app/api/dispatch/team/route.test.ts` (7 tests) — items validation, mode filter, happy path, rate-limit, Windows-error surfacing, 500 fallthrough.
- `app/api/webhook/session-complete/route.test.ts` (7 tests) — validation 400s, project-not-found writes orphan event (returns 200 by design), idempotency-key happy path + dedupe, legacy fallback.

36 new tests, suite at 1026 passing / 6 skipped / 0 failing. Residual gaps (overseer/chat, overseer-chat.tsx, 32 other routes) tracked above for opportunistic follow-up.

### [30.D3] Documentation drift across 3 of 4 references — RESOLVED 2026-06-09 (Phase 32)
- `references/schema.md`: added Phase 23.2 `Dispatch`, Phase 11.3 `FeatureProposal`, Phase 24.2 `ToolCallEvent`, Phase 23.3 `AnthropicUsageEvent`. Updated `Project` with 5 new fields (`businessStage`, `projectContext`, `completionCriteria`, `badges`, `deadline`) and 5 new relations. Added Phase 31 index notes on `Project`, `ActivityEvent`, `ChatMessage`, `HumanTask`. Added `DispatchOutcome.dispatchId`, `ChatSession.compressedHistory`, `UpstreamFeature.proposals` relation.
- `references/api-contracts.md`: rewritten end-to-end via the audit-runner agent. 58 entries across 12 groups covering every route under `app/api/**/route.ts`.
- `references/env-vars.md`: documented `CASCADE_DISPATCH_ID`, `CASCADE_MAX_CONCURRENT_SUBAGENTS`, `NODE_OPTIONS`, `CASCADE_PORT`, `ANTHROPIC_FEATURE_SOURCES`, plus a Runtime-set section for `CASCADE_DISPATCH_ID`/`NODE_ENV`/`CI`.
- `references/architecture.md`: dispatch diagram now reflects Phase 29 multi-pane wt layout; decision #7 covers `<PlatformBadge />` (Phase 28); new decisions #12 (feature proposal persistence, Phase 11.3), #13 (vitest source-map patch, Phase 30), #14 (hot-path indexes, Phase 31).

### [30.D1] CRITICAL shell injection via project name — RESOLVED 2026-06-09 (Phase 31)
`lib/claude-dispatcher.ts:queuedPlaceholderCmd` now calls `sanitizeForShell(projectName)` instead of stripping single-quotes only. `;`, `$()`, backticks, `\n`, and the other shell metachars are removed before the placeholder is interpolated into the tmux `execSync` call. Tests in `lib/claude-dispatcher.injection.test.ts` (6 scenarios) lock the invariant.

### [30.D4] Missing Prisma indexes on hot paths — RESOLVED 2026-06-09 (Phase 31)
Added: `Project.@@index([lastActivityAt])` + `@@index([status, lastActivityAt])`, `ActivityEvent.@@index([createdAt])` + `@@index([projectId, createdAt])`, `ChatMessage.@@index([sessionDate, createdAt])`, `HumanTask.@@index([status, priority, createdAt])`. Migrated via `prisma db push`. Dashboard / activity-feed / briefing / overseer-history queries now hit indexes instead of full-table scans.

### [30.D5] Rate-limiter Map unbounded — RESOLVED 2026-06-09 (Phase 31)
`lib/rate-limiter.ts` now sweeps expired entries when the store grows past 256 keys. O(n) walk, amortized to near-zero per call. Test asserts the store doesn't grow without bound under rotating-key traffic.

### [30.D6] Unguarded JSON.parse in knowledge pages — RESOLVED 2026-06-09 (Phase 31)
Extracted `parseLessonTags` into `lib/lesson-utils.ts`. Returns `[]` on malformed input, null/undefined, empty string, non-array shapes; coerces array members to strings. Applied at all three lesson surfaces (`app/knowledge/page.tsx`, `app/knowledge/[category]/page.tsx`, `app/knowledge/lesson/[id]/page.tsx`). The `anthropic-feature-check.ts:219` finding was a false positive — already wrapped in try/catch.

### [30.D7] Missing fetch timeouts — RESOLVED 2026-06-09 (Phase 31)
- `lib/deploy-monitor.ts` Vercel + Railway now use `AbortController` with a 10s watchdog; tests in `lib/deploy-monitor.test.ts` simulate hung remotes with fake timers.
- `app/components/overseer-chat.tsx` client-side `/api/overseer/chat` fetch now uses an `AbortController` with a 90s watchdog (server-side cap is 60s; 90s leaves margin for the SSE drain). Cleared in `finally`.

### [27.D1] Vitest source-map symbolicator throws on Windows — RESOLVED 2026-06-07 (Phase 30)
The trigger was `convert-source-map` matching the literal string `sourceMappingURL=data:application/json;base64,` inside `node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/register-D46fvsV_.cjs` — tsx's own code that *generates* sourcemap comments. The regex caught it as a real inline sourcemap and JSON-parsed the following JS, throwing `Unexpected token '�'`. Triggered specifically when `lib/template-seed.test.ts` fired a child-process ENOENT (templates/ is gitignored and absent on this Windows box) and vitest tried to symbolicate the stack walking into tsx. Fix: tracked pnpm patch on `@vitest/utils@4.1.2` that wraps `extractSourcemapFromFile` in a try/catch (committed at `patches/@vitest__utils@4.1.2.patch`, wired via `pnpmPatchedDependencies`). Separately, `lib/template-seed.test.ts` now skips when `templates/web-app-v3.3.md` is absent, so the underlying ENOENT no longer fires. `pnpm test` now exits 0 on Windows with 975 passing / 6 skipped / 0 failures.

### [25.D1] Overseer route streaming migration — RESOLVED 2026-05-04
`app/api/overseer/chat/route.ts` now uses `defaultStreamingAnthropicCaller`. The route synthesizes a single coherent SSE envelope to the client (one `message_start`, one text content block, one `message_stop`) regardless of how many Anthropic calls the tool-use loop makes. Tool_use events are hidden but a synthetic `tool_call_start` event is emitted for any UI progress indicator. Engineer-channel writeback runs after the stream closes; failures still don't affect the client. Route tests rewired to drain the SSE body before asserting side effects, and the test mock for `defaultStreamingAnthropicCaller` synthesizes per-block events so the route's `onEvent` handler exercises the same code paths it would with a live stream.

### [23.D3] Streaming usage logging for wizard + project chat — RESOLVED 2026-05-04
Phase 25.2 added a `pipeSseEvents` helper in `lib/overseer-tools-streaming.ts` and tee'd the Anthropic response in both `/api/wizard/chat` and `/api/projects/[slug]/chat`. The tap watches for `message_delta` events and calls `logUsage` with `callSite: "wizard"` or `"project.chat"` accordingly. Tap failures are caught and never break the client stream.

### [23.5.1] Partial-batch failure aborts subsequent projects — RESOLVED 2026-05-04
`dispatchAll` and `dispatchBatch` now wrap each per-project `enqueueWithDispatchRow` in a try/catch. Individual spawn failures push a failure entry into `results` and the loop continues. The lifecycle helper still marks the failed Dispatch row, the queue still releases the slot, but the rethrow no longer poisons the batch. `tests/scenarios/batch-resilience.test.ts` (3 tests) codifies the new behavior; `tests/scenarios/shell-escape-verifier.test.ts` (4 tests) asserts the architecture-level invariant that prompts go through tmpfiles, never inlined into shell commands.

### [10.1] Queue integration for multi-project dispatch — RESOLVED 2026-04-19
`dispatchAll`, `dispatchBatch`, and `dispatchTeam` now route through the
`DispatchQueue` singleton. Option B shipped: pane grid is created upfront
with "[queued: projectname]" placeholders, and `tmux respawn-pane -k`
replaces each placeholder with the real Claude command as the queue releases
slots. Users see the full grid immediately even on low-RAM hosts; Claude
processes are gated by memory-appropriate concurrency. `dispatchTeam`'s
single lead-agent spawn takes exactly one queue slot. 3 integration tests
in `lib/claude-dispatcher.multi.test.ts` verify enqueue counts + IDs.

**Open follow-up (smaller):** dashboard UI indicator for "N running, M queued"
so users can see queue state for multi-dispatch without looking at tmux.
Not urgent — tmux "[queued]" placeholders already communicate this at the
terminal level.

### [52.D1] Runner agent shares uid with the runner process — RESOLVED 2026-09-06 (52.7)
The agent CLI now spawns as an unprivileged uid via the Agent SDK's
`spawnClaudeCodeProcess` override (lib/runner/agent-user.ts provisions
`tsagent`; the clone dir and the CLI's ~/.claude.json are chowned to it).
A non-root agent cannot read the root runner's /proc/<pid>/environ, so
GITHUB_TOKEN/DATABASE_URL are out of reach even from Bash. Provisioning
degrades to the old same-uid posture with a warning where useradd isn't
available (dev boxes), so runs never break over it. Original note below.

### [52.D1-original] Runner agent shares uid with the runner process (2026-09-06)
The cloud runner's agent subprocess runs same-uid (root) as the runner, so
Bash inside a dispatched session could read /proc/<runner-pid>/environ
(GITHUB_TOKEN, DATABASE_URL) despite the allowlisted agent env. Accepted for
now: dispatches run only operator/owner repos (full-autonomy posture matches
local dispatches) and the container is the boundary. Real fix: spawn the CLI
as an unprivileged user (SDK spawnClaudeCodeProcess override + useradd in
image) or per-job Railway Sandboxes. File-tool path-scoping shipped 52.2.
