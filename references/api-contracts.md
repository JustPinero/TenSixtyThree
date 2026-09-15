# API Contracts

Every route under `app/api/**/route.ts`. Shapes show the fields the handler reads or returns — error responses are always `{ error: string }` with an appropriate status.

Rate limits are token-bucket per IP, scoped by a route key. Format: `N/Mmin` means N requests per M minutes (M is always 60_000 ms = 1 min in source).

**Auth vocabulary (Phases 51–55).** "Session required" means the route calls `getServerSession` and returns 401 `{ error: "Authentication required" }` without a valid `better-auth.session_token` cookie — regardless of `AUTH_REQUIRED`, so these routes need a signed-in user even in local mode. "Active org required" means `lib/org-context.ts#activeOrgContext`: session required (401) → `session.activeOrganizationId` must be set (400 `No active organization`) → membership re-verified (403 `Not a member`). Demo sessions (`User.isDemo`) are refused on spend/key paths. Routes not marked otherwise follow the pre-51 convention (edge middleware redirects/401s when `AUTH_REQUIRED=true`; open in local mode). Removed in 1.0: `/api/team*` (Phase-48 single-team layer) and `/api/kilroy-channel`.

---

## Projects

### `GET /api/projects`
Fleet list with health/unread/advisory/task overlays.
- **Request:** none
- **Response:** `Project[]` ordered by `lastActivityAt desc`, each augmented with `unreadAuditCount`, `hasAdvisory`, `advisoryRead`, `pendingHumanTasks`.

### `POST /api/projects/scan`
Full filesystem scan: import + harvest + advisories + reminders.
- **Request:** none
- **Response:** `{ scan, harvest, advisories }` (reminder result is logged but not returned).
- **Notes:** rate-limited 5/min. Writes a `scan-complete` activity event.

### `POST /api/projects/launch`
Create a new project on disk + in DB via the wizard.
- **Request:** `{ name, slug, projectType?, kickoffContent, createGithubRepo?, isPrivate?, autonomyMode?, agentTeamsEnabled?, prWorkflowEnabled? }`
- **Response:** 201 `{ success, ...launchResult }` or 500 `{ error }`.

### `GET /api/projects/[slug]`
Single project with recent audits + activity.
- **Request:** path `slug`
- **Response:** `Project` with `auditSnapshots` (last 10) and `activityEvents` (last 20). Marks audits read as a side effect.
- **Notes:** 400 on invalid slug, 404 if missing.

### `PATCH /api/projects/[slug]`
Update allowlisted project fields.
- **Request:** body keys filtered to: `status, currentPhase, currentRequest, health, healthDetails, autonomyMode, agentTeamsEnabled, prWorkflowEnabled, stack, progressScore, progressDetails, deploymentInfo, businessStage, projectContext, completionCriteria, badges, deadline, lastSessionEndedAt`. Enum-validated; bad values dropped silently.
- **Response:** updated `Project`. 400 if no valid fields.

### `GET /api/projects/[slug]/sessions`
Recent Claude session logs from disk.
- **Request:** path `slug`, query `limit?` (default 10)
- **Response:** `SessionLog[]` from `getSessionLogs(project.path, limit)`.

### `GET /api/projects/[slug]/work`
Structured remaining-work view: phases, requests, completion state.
- **Request:** path `slug`
- **Response:** result of `getRemainingWork(path, currentPhase, currentRequest)`.

### `POST /api/projects/[slug]/chat`
Streaming SSE chat scoped to a single project.
- **Request:** `{ messages: ChatMessage[] }` (validated)
- **Response:** Anthropic SSE stream (text/event-stream). Uses Sonnet, system prompt cached ephemerally, 60s abort, usage tap logs to `anthropic-usage-log`.
- **Notes:** rate-limited 20/min. 404 if project missing.

### `POST /api/projects/[slug]/dispatch`
Dispatch a Claude Code session for a single project.
- **Request:** `{ mode: "continue"|"audit"|"investigate"|"custom", prompt?: string }`
- **Response:** `{ success, mode, error?, idempotencyKey, dispatchId }`. On success, writes a `session-launched` activity event and updates `currentRequest`.
- **Notes:** rate-limited 10/min.

---

## Dispatch (fleet-wide)

### `POST /api/dispatch/all`
Dispatch every active project in one mode.
- **Request:** `{ mode?: "continue"|"audit" }` (default `"continue"`; other modes rejected)
- **Response:** result of `dispatchAll(prisma, mode)`.
- **Notes:** rate-limited 3/min.

### `POST /api/dispatch/batch`
Tmux-grid batch with per-project modes.
- **Request:** `{ items: [{ slug, mode, prompt? }, ...] }`. Items with invalid mode are dropped; empty list → 400.
- **Response:** `dispatchBatch` result.
- **Notes:** rate-limited 3/min.

### `POST /api/dispatch/team`
Lead Claude coordinating agent teams across projects.
- **Request:** same shape as `/dispatch/batch`.
- **Response:** `dispatchTeam` result.
- **Notes:** rate-limited 3/min.

---

## Overseer (Delamain)

### `POST /api/overseer/chat`
Streaming SSE chat with the Overseer; tool-use loop with the default registry.
- **Request:** `{ messages: ChatMessage[], sessionDate?: "YYYY-MM-DD" }`
- **Response:** synthetic SSE envelope (one `message_start` / text block / `message_stop`) wrapping potentially many Anthropic calls. Tool calls emit synthetic `tool_call_start` events; text deltas pass through.
- **Notes:** rate-limited 20/min. Slash commands `/anthropic-feature-check` and `/anthropic-feature-propose [slug...]` short-circuit into deterministic report responses. 60s abort. Engineer-channel writeback fires off the aggregated text after stream close. Bound to a daily `ChatSession`.

### `GET /api/overseer/session-state`
Read-only view of the day's ChatSession (Phase 16 contract).
- **Request:** query `sessionDate?` (YYYY-MM-DD, defaults to today UTC)
- **Response:** `{ exists: true, sessionId, sessionDate, startedAt, closedAt, activeFlow, workingMemory }` or `{ exists: false, sessionDate }`.
- **Notes:** `Cache-Control: no-store` always. 400 on malformed date.

### `GET /api/overseer/history`
Chat messages for a session date.
- **Request:** query `date?` (defaults to today)
- **Response:** `ChatMessage[]` ordered ascending by `createdAt`.

### `POST /api/overseer/history`
Persist a chat message.
- **Request:** `{ role, content, sessionDate? }`
- **Response:** 201 with created `ChatMessage`.

### `DELETE /api/overseer/history`
Clear history for a date.
- **Request:** query `date?` (defaults to today)
- **Response:** `{ ok: true }`.

### Tool framework

Tool registry, working-memory shape, and built-in read/write tools are documented inline in this file's older section below — see *Tool Framework* and *Built-in tools* for the canonical schemas; nothing has moved.

---

## Knowledge

### `GET /api/knowledge`
All lessons newest-first.
- **Response:** `KnowledgeLesson[]` with `sourceProject{name,slug}`.

### `POST /api/knowledge/harvest`
Harvest lessons from all projects (filesystem-based, no Claude).
- **Request:** none
- **Response:** `harvestKnowledge` result `{ newLessons, ... }`.
- **Notes:** rate-limited 5/min.

### `POST /api/knowledge/harvest-history`
Retroactive Claude-driven harvest from git/session history.
- **Request:** `{ slug? }`. If omitted, harvests all projects.
- **Response:** per-project `retroHarvestProject` result, or aggregated `{ projects[], totalLessons, totalDuplicates, totalProjects }`.
- **Notes:** Requires `ANTHROPIC_API_KEY`. 404 if slug missing.

### `GET /api/knowledge/search`
In-memory scored search across title/content/tags.
- **Request:** query `q` (≤200 chars; empty → `[]`)
- **Response:** `(KnowledgeLesson & { score })[]` sorted desc.

### `GET /api/knowledge/gaps`
Detected knowledge gaps from `detectKnowledgeGaps`.
- **Response:** gap report.

---

## Tasks / Reminders

### `GET /api/tasks`
List human tasks, optionally filtered.
- **Request:** query `status?`, `projectSlug?`, `category?` (enum-validated)
- **Response:** `HumanTask[]` ordered pending-first, priority alphabetical (high < low < normal), then newest.

### `POST /api/tasks`
Create a human task.
- **Request:** `{ title, category?, priority?, projectSlug?, createdBy? }` (defaults: `other`, `normal`, `user`)
- **Response:** 201 `HumanTask`.

### `PATCH /api/tasks`
Update task status / priority / category.
- **Request:** `{ id: number, status?, priority?, category? }`. Status=`done` sets `completedAt`; reverting to pending clears it.
- **Response:** updated `HumanTask`. 400 if no valid fields.

### `DELETE /api/tasks`
Delete a task.
- **Request:** `{ id: number }`
- **Response:** `{ ok: true }`.

### `GET /api/reminders`
Run condition checks, then return non-dismissed reminders.
- **Response:** `Reminder[]` ordered by status then `createdAt` desc.

### `POST /api/reminders`
Create a reminder.
- **Request:** `{ message, conditionType, conditionValue, projectSlug?, createdBy? }`
- **Response:** 201 `Reminder`.

### `PATCH /api/reminders`
Update reminder status.
- **Request:** `{ id, status }`. Setting `triggered` stamps `triggeredAt`.
- **Response:** updated `Reminder`.

### `GET /api/attention`
Aggregate counts for the dashboard attention badge.
- **Response:** `{ total, breakdown: { pendingTasks, blockedProjects } }`.

### `GET /api/activity`
Recent activity events.
- **Request:** query `type?`, `limit?` (default 20, max 100)
- **Response:** `ActivityEvent[]` with `project{name,slug}`, newest first.

---

## Reports / Advisories / Playbook / Briefing

### `POST /api/reports/generate`
Generate a single-project or cross-project report.
- **Request:** `{ type: "single"|"cross-project", slug?, format?: "markdown"|"pdf" }`. `slug` required when `type=single`.
- **Response:** markdown → `{ report, markdown }`. PDF → `application/pdf` binary with `Content-Disposition: attachment`.

### `POST /api/advisories/generate`
Run advisory engine across projects.
- **Request:** none
- **Response:** `generateAdvisories` result.
- **Notes:** rate-limited 5/min.

### `GET /api/playbook`
Read `knowledge/overseer-playbook.md`.
- **Response:** `{ content: string }` (empty string if missing).

### `PUT /api/playbook`
Overwrite the playbook file.
- **Request:** `{ content: string }`
- **Response:** `{ success: true }`.

### `GET /api/playbook/suggestions`
Pattern-mine recent session logs across `building`/`complete` projects for playbook additions.
- **Response:** `{ totalSessionsAnalyzed, projectsAnalyzed, suggestions }`.

### `POST /api/briefing`
Generate a morning briefing via Claude Haiku.
- **Request:** none
- **Response:** `{ briefing, generatedAt, projectCount, blockedCount, recentEventCount, drift, infra }`.
  - `drift` (phase 41.4): `{ findingsCount, section, projects[] }` — fleet-reconciliation drift from a fetch-enabled reconcile pass (5s per-repo box); `section` is the text fed into the model prompt.
  - `infra` (phase 41.7): `{ plugin, remnantProjects }` — coqui-kickoff plugin version + the projects still carrying v3.5 machinery remnants.
- **Notes:** rate-limited 5/min. Requires `ANTHROPIC_API_KEY`. 30s abort. Logs usage telemetry.

### `GET /api/reconciliation`
Fleet-reconciliation drift for the dashboard `FleetDriftPanel` (phase 41.4). Local-only — runs with `fetch:false` (no `git fetch`), so it reports against last-known refs.
- **Request:** none
- **Response:** `{ generatedAt, findingsCount, projects[] }` — per-project reconciliation findings (path-missing, path-casing, dirty-tree, ahead-behind, unpushed-branch, status-drift); renders nothing client-side when the fleet is consistent.

---

## Feature Proposals

### `GET /api/feature-proposals`
List proposals newest-first with feature + project inlined.
- **Request:** query `status?`, `project?` (slug), `limit?` (1–200, default 50)
- **Response:** `{ count, limit, proposals }`. 404 if project slug missing, 400 on bad status.

### `GET /api/feature-proposals/[id]`
Single proposal with feature + project.
- **Response:** `{ proposal }` or 404.

### `PATCH /api/feature-proposals/[id]`
Record resolution.
- **Request:** `{ status: "proposed"|"accepted"|"rejected"|"applied", notes?, resolvedBy? }`. Terminal statuses (accepted/rejected/applied) stamp `resolvedAt`; reverting to `proposed` clears it.
- **Response:** `{ proposal }`. 400 on validation, 404 if missing.

---

## Templates

### `GET /api/templates`
All kickoff templates newest-first.
- **Response:** `KickoffTemplate[]`.

### `POST /api/templates`
Create a template. Setting `isDefault: true` un-flags the previous default.
- **Request:** `{ name, content, description?, projectType?, isDefault? }`
- **Response:** 201 `KickoffTemplate`.

### `PATCH /api/templates`
Update by id (id in body, not URL).
- **Request:** `{ id, ...fields }`. Setting `isDefault: true` un-flags the previous default.
- **Response:** updated `KickoffTemplate`.

### `DELETE /api/templates`
Delete by id (id in body, not URL).
- **Request:** `{ id }`
- **Response:** `{ success: true }`.

---

## Integrations

### `GET /api/integrations/auth`
Status of vercel / github / railway / 1password CLIs.
- **Response:** array of `{ service, authenticated, ... }` from `checkAllAuthStatuses`.

### `POST /api/integrations/auth`
Launch a Terminal window running the service's login command.
- **Request:** `{ service: "vercel"|"github"|"railway"|"1password" }`
- **Response:** `{ ok: true, service }` or 500 with launch error.

### `POST /api/integrations/github`
Create a GitHub repo via `gh`.
- **Request:** `{ name, isPrivate?, description? }` (`isPrivate` defaults true)
- **Response:** 201 `{ url }`, 401 if `gh` unauthenticated, 409 on conflict.

### `GET /api/integrations/onepassword`
1Password env-var status for a project.
- **Request:** query `path`, `name` (path validated by `isInsideProjectsDir`)
- **Response:** `{ authenticated: true, vars }` or 401 / 403.

### `POST /api/integrations/onepassword`
Create vault item or populate `.env.local`.
- **Request:** `{ action: "create"|"populate", projectPath, projectName, vars? }`
- **Response:** result of `createVaultItem` or `populateEnvLocal`.
- **Notes:** 401 if `op` CLI unauthenticated. Vault hardcoded to `"Cascade"`.

### `GET /api/integrations/deploy-status`
Deployment status from Vercel or Railway.
- **Request:** query `platform: "vercel"|"railway"`, `projectId`
- **Response:** `getDeploymentStatus` result. 400 on missing/invalid params.

---

## Channels

### `GET /api/engineer-channel`
Read `.claude/engineer-channel.md` (falls back to legacy `kilroy-channel.md`).
- **Response:** `{ content: string }` (empty if neither exists).

### `POST /api/engineer-channel`
Append a timestamped message.
- **Request:** `{ from: "engineer"|"overseer"|"kilroy"|"delamain", message: string }`
- **Response:** `{ ok, sender, timestamp }`. Creates the file with a header if absent.
- **Notes:** the `/api/kilroy-channel` route alias was removed in 1.0 (the file-level fallback to `.claude/kilroy-channel.md` remains).

---

## Wizard / Hooks / Preflight / Webhook

### `POST /api/wizard/chat`
Streaming SSE chat for the project-creation wizard.
- **Request:** `{ messages: ChatMessage[], templateContent: string }`
- **Response:** Anthropic SSE stream (Sonnet). Usage tap logs to `anthropic-usage-log`.
- **Notes:** rate-limited 20/min. 60s abort. Requires `ANTHROPIC_API_KEY`.

### `POST /api/hooks/validate`
Scan + repair every project's `.claude/settings.json` hook format (flat → nested).
- **Request:** none
- **Response:** `{ totalRepairs, repairedProjects, totalProjects, results: HookRepairResult[] }` where each result is `{ project, slug, status: "ok"|"repaired"|"no-settings"|"error", repairsCount, error? }`.

### `GET /api/preflight`
Live dispatch preflight (PATH checks for tmux/claude/etc).
- **Response:** `checkDispatchPreflight` result.
- **Notes:** `Cache-Control: no-store`.

### `GET /api/recommendations`
Phase 40 [P3] — outcome-driven dispatch recommendations for the dashboard.
- **Response:** `{ recommendations: Recommendation[] }` (see `lib/dispatch-recommendations.ts`).
- **Notes:** Reads `DispatchOutcome` rows from the last 14 days, groups by project, runs the pure `computeRecommendations` engine. `Cache-Control: no-store`. Phase 41.2: rows feed `goalAchieved` into the engine — the failing-mode rule scores goal-weighted successes (goal-verified 1.0 > self-reported 0.6 > evaluator-contradicted 0).

### `POST /api/webhook/session-complete`
Receives Claude Code Stop-hook pings from managed projects.
- **Request:** `{ projectPath: string, idempotencyKey?: string }`
- **Response:** `{ ok, slug, name, action, idempotencyKey?, importError? }`. Deduped responses return `{ ok, deduped: true, slug }` when the dispatch is already completed.
- **Notes:** Correlates by `idempotencyKey` (canonical) with legacy fallback via newest `session-launched` activity event. Side effects: targeted re-import of the project, dispatch-queue slot release, Dispatch row → `completed`, `session-complete` (or `orphaned-webhook`) activity event, escalation detection from latest session log → auto-creates `HumanTask` rows from `[HUMAN TODO]` signals (dedup on `projectSlug+title` when dispatch in scope), records a `DispatchOutcome` (success | attention-needed | test-failure | blocker), refreshes per-project feature-usage ledger. All best-effort: failures are logged but don't fail the webhook.
- **Phase 41.2 (goal state):** the outcome row also records `goalCondition` (recovered from the matched Dispatch's prompt snapshot — the `/goal` line the dispatcher composed from the request's acceptance criteria; null for ad-hoc dispatches and on the legacy path), plus `goalAchieved`/`goalReason` parsed defensively from the session log via `lib/dispatch-goals.ts#parseGoalOutcome` (markers: `[GOAL ACHIEVED]` / `[GOAL NOT ACHIEVED]` or prose "goal achieved/not achieved"; last verdict wins; no marker → null, never throws).
- **Phase 41.5 (resilience — shared ingestion + spool/drain):** the ingestion body is extracted into `lib/webhook-ingest.ts#ingestSessionComplete(prisma, { projectPath, idempotencyKey })` — the route is now a thin HTTP wrapper (validate → delegate → respond). Stop hooks no longer inline the curl: the canonical script `scripts/session-complete-hook.sh` (emitted into projects' `settings.json` by `scripts/install-hooks.ts#buildWebhookCommand`) POSTs here and, on connection failure (server down / `op` signed out), appends the JSON payload to a spool file — `CASCADE_WEBHOOK_SPOOL`, default `~/.cascade/webhook-spool.jsonl` (outside any repo). The server drains the spool on boot and every 60s (`lib/webhook-spool.ts#drainWebhookSpool`, wired via `lib/webhook-spool-runtime.ts` in `instrumentation.ts`), replaying each entry through the SAME `ingestSessionComplete` path as a live POST. Drain is atomic vs concurrent writes: the spool is renamed aside before reading, so a Stop-hook append landing mid-drain lands in a fresh spool (never lost, never double-ingested). Malformed lines are quarantined to `<spool>.quarantine` + logged, never fatal; ingest-failed entries are re-spooled for retry. Idempotent via the dispatcher's `idempotencyKey` dedup — replaying the same payload yields one outcome. **Fleet rollout of the new script-based hook command is a follow-up** (existing `settings.json` entries that inline the old curl keep working unchanged).
- **Fix 41.D9 (portable hook path):** `buildWebhookCommand` emits a `$HOME`-relative script reference — `bash "$HOME/.cascade/session-complete-hook.sh" "$PWD" <port> > /dev/null 2>&1 &` — never an absolute `/Users/...` path, so a committed, cross-machine-synced `settings.json` hook resolves on every machine (`$HOME` expands per-machine inside the double-quoted command). `scripts/install-hooks.ts#copyCanonicalScript({home?, sourcePath?})` installs `scripts/session-complete-hook.sh` → `<home>/.cascade/session-complete-hook.sh` (overwrite so updates propagate, `chmod 0755`); `processProject` copies before writing project settings, and `instrumentation.ts` copies on server boot (wrapped so it never throws into startup) so a freshly-cloned machine self-heals. With this, the fleet rollout is safe to run.

---

## Health / Demo (public)

### `GET /api/health`
Railway healthcheck target (Phase 51.4). Public — must answer even when auth/env is misconfigured. `force-dynamic`.
- **Request:** none
- **Response:** `{ status: "ok"|"degraded", db: "up"|"down", missingEnv: string[], warnings: string[] }` — `missingEnv` = unset `hosted-required` vars from `lib/env-manifest.ts`; `warnings` includes a line when `AUTH_REQUIRED !== "true"`.
- **Notes:** 200 when `SELECT 1` succeeds, 503 when the DB is unreachable. Missing env is reported but does not change the status code.

### `POST /api/demo`
"Try the demo" (Phase 54.5) — mint an ephemeral sandbox (demo user + org + projects + board + posts) and sign the visitor in. Public.
- **Request:** none
- **Response:** `{ ok: true }` + `Set-Cookie: better-auth.session_token=<token>.demo` (httpOnly, sameSite lax, 2h).
- **Notes:** rate-limited 3/h per IP (key `demo`) and 60/h global (`demo:global`); either → 429 `{ error: "Too many requests. Try again later." }`. Every mint first sweeps demo identities older than 24h (`cleanupDemo`).

### `GET /api/demo/status`
Is the current session a demo? Powers the demo banner. Public.
- **Response:** `{ demo: boolean }` (false when no session).

---

## Account

### `GET /api/account/password`
Does the user have a credential (password) account yet? Session required.
- **Response:** `{ hasPassword: boolean }`.

### `POST /api/account/password`
Password-after-first-login (Phase 54.1) via Better Auth's server-only `setPassword`. Session required.
- **Request:** `{ newPassword: string }` (8–128 chars)
- **Response:** `{ ok: true }`. 400 on length violation.

### `GET /api/account/anthropic-key`
BYOK presence check (Phase 54.2). Session required; demo sessions → 401.
- **Response:** `{ hasKey: boolean }` — plaintext never leaves the server.

### `PUT /api/account/anthropic-key`
Store the user's own Anthropic key, sealed with `ENCRYPTION_KEY` (`lib/crypto-box`). Session required; demo → 401.
- **Request:** `{ key: string }` — must start with `sk-ant-`, 20–300 chars.
- **Response:** `{ ok: true }`. 400 on bad format.

### `DELETE /api/account/anthropic-key`
Clear the stored key (falls back to the app key). Session required; demo → 401.
- **Response:** `{ ok: true }`.

---

## Organizations (Phase 54.3 / 55.1)

### `GET /api/orgs`
My organizations. Session required.
- **Response:** `{ orgs: (Organization & { role })[], activeOrganizationId: string|null }` (ordered by membership `createdAt asc`).
- **Notes:** first authenticated touch applies pending org invitations for the session's email (`acceptPendingInvitations`, 55.1) before listing.

### `POST /api/orgs`
Create an org; caller becomes `owner`. Session required.
- **Request:** `{ name: string }` (2–80 chars, trimmed)
- **Response:** `{ org: Organization }` (slug auto-uniqued: `coqui-labs`, `coqui-labs-2`, …). 400 on bad name.

### `PUT /api/orgs/active`
Switch the session's active organization. Session required.
- **Request:** `{ organizationId: string }`
- **Response:** `{ ok: true }`. 400 if missing; 403 `Not a member of that organization`.

### `GET /api/orgs/posts`
The active org's typed feed. Active org required.
- **Response:** `{ posts: OrgPost[] }` — newest first, max 100, each with `author{name}` and `project{name,slug}|null`.

### `POST /api/orgs/posts`
Create a feed post. Active org required.
- **Request:** `{ type: "goal"|"objective"|"bug"|"test-request"|"note", title: string (1–200), body?: string (≤5000), projectId?: number }`
- **Response:** `{ post: OrgPost }`. 400 on bad type/title, or when `projectId` is not shared into this org.

### `GET /api/orgs/projects`
Projects shared into the active org. Active org required.
- **Response:** `{ projects: [{ id, name, slug, status, health, progressScore, currentPhase, lastActivityAt, sharedAt }] }` newest-share first.

### `POST /api/orgs/projects`
Share a project into the active org. Active org required.
- **Request:** `{ projectId: number }`
- **Response:** `{ share: OrgProjectShare }`. 400 if missing; 404 when the project doesn't exist **or the caller can't see it** (`canSeeProject`, 1.0 IDOR fix — strangers get the same 404); 409 `Already shared to this organization`.

### `DELETE /api/orgs/projects`
Unshare. Active org required.
- **Request:** `{ projectId: number }`
- **Response:** `{ ok: true }` (idempotent `deleteMany`). 400 if missing.

### `POST /api/orgs/invite`
Invite a member into the active org (Phase 55.1). Session required + membership in `activeOrganizationId` (400 `No active organization`, 403 `Not a member`).
- **Request:** `{ email: string, role?: "member"|"admin" }` (default `member`; only `owner`/`admin` members may hand out `admin` → 403 otherwise)
- **Response:** `{ invitation: Invitation }` (7-day expiry). Re-inviting the same email cancels the previous pending row first. Sends an email via `lib/email` (Resend, or console log when `RESEND_API_KEY` is unset) pointing at `${BETTER_AUTH_URL}/signin`. 400 on invalid email.
- **Notes:** membership is applied on the invitee's first authenticated touch (`GET /api/orgs`), not by a token link.

### `GET /api/orgs/linear`
Does the active org have a Linear key stored? Active org required.
- **Response:** `{ hasKey: boolean }`.

### `PUT /api/orgs/linear`
Store the org's Linear API key, sealed with `ENCRYPTION_KEY`. Active org required.
- **Request:** `{ key: string }` — must start with `lin_api_`, 20–200 chars.
- **Response:** `{ ok: true }`. 400 on bad format.

### `POST /api/orgs/linear`
Import Linear issues into an org board (idempotent by `Ticket.linearIssueId`). Active org required.
- **Request:** `{ boardId: string }`
- **Response:** `{ created: number, updated: number }`. 404 `Board not found` when the caller can't access the board; 400 `No Linear key stored for this organization`; 502 `{ error }` when the Linear fetch/sync throws.

---

## Boards / Tickets / Milestones (Phase 54.4)

Ownership rule: a board or milestone has exactly one of `organizationId` / `ownerUserId` (enforced in `lib/boards.ts`). `canAccessBoard` = personal owner, or member of the board's org. Positions are fractional floats (`positionAfter`).

### `GET /api/boards`
My boards: personal + active-org. Session required.
- **Response:** `{ boards: Board[] }` ordered `createdAt asc`. A stale `activeOrganizationId` (membership revoked) is ignored rather than leaking that org's boards.

### `POST /api/boards`
Create a board with default columns `Todo` / `In Progress` / `Done`. Session required.
- **Request:** `{ name: string (1–80), scope?: "personal"|"org" }` (default `personal`)
- **Response:** `{ board: Board }`. `scope: "org"` → 400 `No active organization` / 403 `Not a member`.

### `GET /api/boards/[id]`
Full board. Session required.
- **Response:** `{ board, columns: BoardColumn[] (position asc), tickets: Ticket[] (position asc) }`. 404 when inaccessible or missing.

### `POST /api/tickets`
Create a ticket at the end of a column. Session required + board access (401 / 404).
- **Request:** `{ boardId, columnId, title (1–200), description? (≤5000), priority?: "low"|"normal"|"high"|"urgent", milestoneId? }`
- **Response:** `{ ticket: Ticket }` (`createdById` = caller). 400 when title/columnId missing, column not on that board, or milestone out of scope (must be the caller's personal milestone or belong to the board's org).

### `PATCH /api/tickets`
Move / edit a ticket. Session required + board access. 404 if the ticket doesn't exist.
- **Request:** `{ id, title?, description?, priority?, columnId?, position?: number, assigneeUserId?: string|null, milestoneId?: string|null }` — only recognised keys are applied; `null` clears assignee/milestone.
- **Response:** `{ ticket: Ticket }`. 400 when `columnId` isn't on the ticket's board, the assignee is out of scope (personal board → must be the owner; org board → must be a member), or the milestone is out of scope.

### `DELETE /api/tickets`
Session required + board access.
- **Request:** `{ id }`
- **Response:** `{ ok: true }`. 404 if missing.

### `GET /api/milestones`
Personal + active-org milestones, `position asc`. Session required (stale org membership ignored, as with boards).
- **Response:** `{ milestones: Milestone[] }`.

### `POST /api/milestones`
Session required.
- **Request:** `{ title (1–200), description? (≤5000), targetDate?: ISO string, scope?: "personal"|"org" }`
- **Response:** `{ milestone: Milestone }` (status `planned`, appended to the end). `scope: "org"` → 400 / 403 as with boards.

### `PATCH /api/milestones`
Session required; the milestone must be the caller's own or in an org they belong to — otherwise 404 `Not available` (401 without a session).
- **Request:** `{ id, title?, description?, status?: "planned"|"in_progress"|"shipped", targetDate?: ISO string|null, position?: number }`
- **Response:** `{ milestone: Milestone }`. 400 on bad status.

### `DELETE /api/milestones`
Same gate as PATCH.
- **Request:** `{ id }`
- **Response:** `{ ok: true }`.

---

## Cloud Dispatch (Phase 52)

### `POST /api/dispatch/cloud`
Enqueue a hosted dispatch for the runner service. Session required; demo → 403 `Demo mode: dispatching is disabled in the sandbox.`
- **Request:** `{ slug: string, mode?: "continue"|"audit"|"investigate"|"custom" (default `continue`), prompt?: string }` (`prompt` stored as `customPrompt`, ≤5000, only when `mode: "custom"`)
- **Response:** `{ dispatch: Dispatch }` — `runtime: "cloud"`, `status: "queued"`, `ownerUserId` = caller, `organizationId` = active org.
- **Notes:** 404 when the project is missing or not visible to the caller (`canSeeProject`); 400 when the project has no `githubRepo`; 400 with the reason when `autonomyMode` is `manual` (`cloudPermissionFor` — nobody can approve headless; full→bypass, semi→acceptEdits).

### `GET /api/dispatch/cloud/[id]`
One cloud run in full. Session required.
- **Response:** `{ dispatch: Dispatch (sans outcome), outcome: DispatchOutcome|null, events: [{ id, summary, createdAt }] }` — events are the project's `ActivityEvent` rows whose `details` contain `"dispatchId":"<id>"`, oldest first, max 200.
- **Notes:** 404 when unknown, not `runtime: "cloud"`, or the project isn't visible to the caller.

---

## Admin

### `GET /api/admin/invites`
List independent-user invites (Phase 54.1). Admin only: session required (401), then 403 `Not available in demo mode` / 403 `Admin only` (`User.role !== "admin"`).
- **Response:** `{ invites: UserInvite[] }` newest first, max 100.

### `POST /api/admin/invites`
Invite a user who belongs to no org (org members go through `POST /api/orgs/invite`). Admin only, same gate.
- **Request:** `{ email: string }`
- **Response:** `{ invite: UserInvite }` (7-day expiry, consumed by the `user.create.before` invite gate). 400 on invalid email; 409 when a live pending invite already exists. Sends the sign-in email via `lib/email`.

### `POST /api/admin/ops`
Headless operator ops (Phase 52.3) — exists because the hosted DB is private-network-only. Structured ops only: no raw SQL, no destructive verbs.
- **Auth:** header `x-ops-secret` compared constant-time against `OPS_SECRET`. When `OPS_SECRET` is unset or shorter than 16 chars the route 404s entirely; wrong secret → 401 `Unauthorized`.
- **Request:** `{ op, ...args }` where `op` is one of:
  - `seed-project` — `{ name, slug (/^[a-z0-9][a-z0-9-]{1,60}$/), githubRepo ("owner/repo") }` → upserts the project by slug (`path: /cloud/<slug>`); response `{ project }`. 400 if any field invalid.
  - `enqueue-cloud` — `{ slug, mode? (default `audit`), prompt? }` → creates a `runtime: "cloud"` Dispatch (no owner/org); response `{ dispatch }`. 400 `No such project (or repo-less)`; 400 when the project's `autonomyMode` is `manual` (same invariant as the user route).
  - `cloud-status` — no args → `{ recent: (Dispatch & { outcome })[] }`, last 10 cloud dispatches by `enqueuedAt desc`.
  - `cloud-events` — `{ dispatchId }` → `{ events: [{ id, summary, createdAt }] }` (oldest first, max 200). 400 if missing.
- **Notes:** unknown `op` → 400 `Unknown op`.

---

## Overseer Tool Framework (canonical)

`Tool<TInput, TOutput>` shape:
- `name: string` (unique within a registry)
- `description: string` (sent to the model)
- `inputSchema: Record<string, unknown>` (JSON Schema; Anthropic validates inputs)
- `handler: (input, ctx) => Promise<output>`

`ToolContext`: `{ prisma: PrismaClient; sessionId?: string }`. Tools that read or write working memory require `sessionId`.

`ToolRegistry`: `register`, `get`, `has`, `list`, `toAnthropicTools`, `execute`. Handler errors are wrapped as `{ ok: false, error }` so the loop never crashes on a single tool fault.

`runToolUseLoop({caller, model, systemPrompt, messages, registry, ctx, maxIterations, maxTokens})`: pure async loop. Returns `{ messages, finalText, toolCallsExecuted, truncated }`. Bails at `maxIterations` (default 8) with `truncated: true`. Tool errors flow back to the model as `tool_result` blocks with `is_error: true`.

### Built-in tools

**Read tools (no side effects)**

| Name | Input | Output |
|------|-------|--------|
| `query_project` | `{ slug }` | Single-project state |
| `query_projects` | `{ status?, health?, includeBackburner?, limit? }` | Filtered fleet list |
| `get_recent_activity` | `{ projectSlug?, eventType?, limit? }` | Newest-first activity events |
| `get_session_logs` | `{ slug, limit? }` | Recent Claude session logs |
| `get_dispatch_outcomes` | `{ projectSlug?, mode?, limit? }` | Per-mode totals + recent failures |
| `get_yesterday_summary` | `{ daysAgo?, perMessageMaxChars? }` | Last 3 assistant messages from a prior date |
| `get_engineer_messages` | `{ maxChars? }` | Recent engineer-channel content |
| `get_playbook` | `{ bullets? }` | overseer-playbook.md (full or rules-only) |
| `get_session_state` | `{}` | `{ sessionId, activeFlow, workingMemory }` |

**Write tools (mutate state)**

| Name | Input | Side effects |
|------|-------|--------------|
| `update_session_memory` | `{ patch }` | Deep-merges into `chatSession.workingMemory`. Throws via tool error if session is closed or `ctx.sessionId` missing. |
| `set_active_flow` | `{ flow: "inventory_walk"\|"dispatch_planning"\|"incident_triage"\|null }` | Writes `chatSession.activeFlow`. |
| `propose_dispatch` | `{ slug, mode, instructions? }` | Appends to `workingMemory.proposedDispatches`. |
| `create_reminder` | `{ conditionType, conditionValue, message, projectSlug? }` | Creates a Reminder row (`createdBy: "delamain"`). |
| `create_human_todo` | `{ title, projectSlug?, category?, priority? }` | Creates a HumanTask row (`createdBy: "delamain"`); resolves projectSlug to projectId when possible. |

**Working-memory shape (canonical)**

`chatSession.workingMemory` is a JSON document. Keys used by the defaults today:
- `covered: { [slug]: { progress?, blocker?, note? } }` — confirmed during inventory walks
- `proposedDispatches: [{ slug, mode, instructions?, proposedAtISO }]`
- (free-form for anything else the model wants to record)
