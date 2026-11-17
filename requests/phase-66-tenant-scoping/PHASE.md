# Phase 66 — Tenant scoping for the Overseer and dashboard data

Source: deep review (S4/A2/F1, R6, F2, F5, F6, S7, S13, S14, A3, A5, A10).
Needs schema changes → AFTER phase 59 (migrate baseline).

## 66.1 — Overseer is per user
- `ChatSession.userId`, `ChatMessage.userId` (nullable = local mode);
  session key (userId, date). History GET/POST/DELETE scoped to the viewer.
- `ToolContext.viewer`; every project/activity/task tool filters through
  `visibleProjectFilter`. Mutating tools record the acting user.
- Remove the `[ENGINEER]` writeback (retired tag) or restrict to local mode.
- `/anthropic-feature-propose`: admin/local only, visible non-demo projects,
  `resolveAnthropicKey`.
## 66.2 — Dashboard and sidebar data through the visibility matrix
- activity, briefing, reconciliation, recommendations, attention, tasks,
  reminders, usage/summary, dispatch/status, projects/[slug]/{sessions,work}.
- `ActivityEvent.dispatchId` column + distinct `cloud-progress` event type
  (closes [1.0.D4]); cloud progress no longer fires notify sounds.
- `HumanTask`/`Reminder` owner scoping; demo sees demo-org data only
  (own org's shares, not every `isDemo` row).
## 66.3 — Global settings become per user or admin-only
- Chat model: per-user preference with an admin-set default.
- Playbook/brains: admin (hosted) or local only.
## 66.4 — Org permissions
- Share/unshare: project owner or admin only. Linear key + unshare: org
  owner/admin. `Member` unique (userId, organizationId).

## AC → tests
- Two-user fixtures: user B never sees A's chat history, working memory,
  activity, tasks, reminders, usage, or project data via any tool or route.
- Demo fixture: zero non-demo rows from every dashboard route; zero rows
  from another demo org.
- Role matrix for share / unshare / Linear key.
