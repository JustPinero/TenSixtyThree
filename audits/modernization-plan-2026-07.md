# TenSixtyThree Modernization Plan — 2026-07-28 deep audit

Three parallel sweeps (functionality, Anthropic API usage, config surfaces) + debt review.
Suite at audit time: 1,257 tests green. Goal: kill half-cocked logic, adopt what Anthropic
shipped since we built this, and point the repo at its second life.

## Audit findings (condensed)

**Healthy:** Phase 42 hardening intact; no retired models or dead API params; voice/TTS wired;
spool drain live; no placeholder pages; playbook plugin v4.0.1 current; install-hooks portable.

**Half-cocked (the honest list):**
1. Teams layer (43.1/45.1): backend + tests only. Zero runtime importers, no UI, no invite-accept route.
2. Three no-op Project toggles: `autonomyMode` (stored, displayed, never consulted — dispatches
   always run CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true), `agentTeamsEnabled`, `prWorkflowEnabled`.
3. Webhook quarantine written, never surfaced (silent ping loss).
4. Legacy agent-team dispatch bypasses queue/watchdog ([23.D2]) and ignores its own flag.
5. In-app Playbook (`knowledge/overseer-playbook.md`) has no sync path to kilroy-brain — two
   divergent playbooks.
6. harvest.sh → Stop-hook wiring + push step still manual (kilroy-brain side).

**Obsoleted-by-new-features (hand-rolled → native):**
7. `chat-history-compressor.ts` (Haiku summarization at 25 turns) → server-side compaction beta.
8. `retroactive-harvester.ts` + `anthropic-feature-check.ts` regex/try-catch JSON parsing →
   structured outputs (`output_config.format.json_schema`).
9. No SDK; raw fetch everywhere; zero retry/backoff on all 8 call sites → @anthropic-ai/sdk
   (retries free; tool-runner optional later).
10. Overseer on claude-sonnet-4-6 → Sonnet 5 (near-Opus quality, same list price, intro pricing
    through 2026-08-31). Upgrade-safe: no temperature/top_p anywhere, no model gates. Only
    coupling: `usage-summary.ts` MODEL_PRICING needs a sonnet-5 row.
11. Docs drift (fixed in this phase): schema.md missing Teams models; architecture.md missing
    Phase 42 + Teams; CLAUDE.md feature list stale; `.claude/settings.json` PostToolUse hooks
    read `$CLAUDE_TOOL_USE_FILE` (dead var — hooks now get stdin JSON; fixed to jq).

## Execution phases

### Phase 46 — Truth & hygiene (STARTED tonight)
- [x] Fix dead PostToolUse hooks (stdin-JSON via jq)
- [x] schema.md: Teams models documented
- [x] architecture.md: Auth row honest + decisions #18 (Phase 42) + #19 (Teams foundation)
- [x] CLAUDE.md feature list current
- [x] 46.1 Quarantine surfacing (DONE 07-30): count + latest-error chip on dashboard (or /observability), test-first
- [x] 46.2 Debt quick-kills (DONE 07-30: 41.D2/D3/D7/D8 + 40.D1 stale-closed + 42.D1 shipped): [41.D3] cache trust-map parse (3 call paths), [41.D2] jq-built hook
      payload, [40.D1] flaky countdown test, [41.D7]+[41.D8] missing tests
- [x] 46.3 Overseer prompt (DONE 07-30): add Teams-awareness sentence + refresh snapshot test

### Phase 47 — API modernization (test-first per site)
- [x] 47.1 Model bump (DONE 07-28): sonnet-4-6 → claude-sonnet-5 at 4 sites (overseer loop, streaming, wizard,
      projects-chat, proposer) + MODEL_PRICING row w/ intro pricing + verify cache-min comments
      (Sonnet 5 min prefix differs; confirm cache_read>0 in telemetry after)
- [~] 47.2 PARTIAL (07-30): retry/backoff shipped for all 5 non-streaming callers via lib/anthropic-fetch.ts; SDK adoption + streaming retry still open for `defaultAnthropicCaller`/streaming caller (keeps injectable
      AnthropicCaller seam; SDK gives 429/5xx retries). Leave Haiku utility sites on fetch or
      migrate opportunistically
- [x] 47.3 Structured outputs (DONE 07-30)
- [ ] 47.4 Server-side compaction spike (deferred: deep ChatSession integration; not drive-day work): replace/fallback chat-history-compressor. Ship behind env flag
- 47.5 (optional) cache-diagnostics beta in telemetry page

### Phase 48 — Finish or kill the half-built (DECISIONS NEEDED — see questions)
- 48.1 autonomyMode: ENFORCE (map full→skip-permissions, semi→acceptEdits, manual→default
      permission prompts in dispatched sessions) or REMOVE the toggle
- 48.2 agentTeamsEnabled: gate dispatchTeam with it + move team dispatch onto queue/watchdog
      ([23.D2]); prWorkflowEnabled: wire into kickoff prompt or remove
- 48.3 Teams: minimal UI (activity feed page consuming listTeamActivity + invite-accept route)
      OR consciously park with a dated note. Recommendation: minimal feed page — it's the
      collision-plane demo surface and useful single-user (agent vs human work in one stream)
- 48.4 Playbook reconciliation: pick canonical (in-app file vs kilroy-brain), sync the other

### Phase 49 — New-life features (the fun ones)
- 49.1 Headless dispatch mode via Claude Agent SDK alongside tmux: structured events instead of
      log parsing; the foundation for hosted Teams later
- 49.2 Native agent-teams dispatch option (one Claude Code session w/ subagent team vs tmux grid)
- 49.3 /goal injection per dispatch (completion condition from the request file)
- 49.4 Overseer on Opus 4.8 (optional): unlocks mid-conversation `role:"system"` messages —
      engineer-channel updates delivered MID-chat without cache invalidation. Cost ~2x Sonnet
- 49.5 kilroy-brain: wire harvest.sh into Stop hook + auto-push (finishes the shared-brain loop)

## Sequencing
46 → 47 are mechanical and safe; start immediately. 48 needs Justin's calls (below). 49 after
48.3's direction is set. Each phase: branch, RED→GREEN per request, validate.sh, merge.


## Promoted-from-debt (2026-07-30) — feature slices, not defects
- **[23.D1] Overseer eval recordings** — needs a live-API `pnpm eval:refresh` session + hand-curation of 5 scenario fixtures. Do as its own sitting with API budget.
- **[23.D2] Team-dispatch lifecycle** — don't invest in tmux teammate-mode plumbing: the 07-28 research shows native agent teams + Agent SDK obsolete this path. Fold into Phase 49's dispatch rearchitecture.
- **[23.D4] Real-log escalation corpus** — sanitize 5-10 real session logs into eval fixtures; a curation session.
- **[Theme Pack]** — SHIPPED 2026-09-04 (Phase 53): 12-pack registry (lib/theme-registry.ts), pack-apply with persona-pristine guard, 10 new CSS themes, registry-driven settings grid. Remaining: Leonardo portraits (Justin; <Portrait/> fallback covers absence).
- **[36.A5] Server-side chat persistence** — real slice (schema + route + rehydration); protects against mid-stream tab closes. Good candidate alongside the compaction phase (both touch ChatSession).
- **[30.D2-residual] route tests** — opportunistic; add when touching a route.


## Phase 50 (proposed 2026-07-31) — Deployment Registry & Decommission Flow
Justin ran a manual Vercel+Railway cleanup (7 projects scrapped) and wants it productized.
- 50.1 Deployment registry: per fleet project, track deploy targets (vercel/railway ids, URLs,
  last-deploy age) — populated via `vercel project ls --json` + `railway list --json` scans.
- 50.2 Staleness surfacing: dashboard chip when a deployment is >30/60/90d stale or a Railway
  project has services but its fleet project is backburnered (= idle spend).
- 50.3 Decommission flow (checklist, human-gated like deploys): confirm dependencies (front→back
  bundle scan — the site-unseen lesson), dump any DBs to local backup, delete deployment(s),
  KEEP repo, log an ActivityEvent. Deletes always require explicit confirmation; DB-bearing
  projects require the backup step to complete first.
- 50.4 Cost visibility: Railway is the money side — surface running-service counts per project.
