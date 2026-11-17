# Phase 70 — Data integrity and hygiene

Source: deep review (A3, A4/S10, A9, A15-A18, S5, S6, S11, S15, F28).
Schema changes → after phase 59.

- **Linear import**: existing-ticket lookup scoped to the target board;
  unique (boardId, linearIssueId); target board must belong to the active org.
- **Deletes that work**: `onDelete: Cascade` on Project children
  (FeatureProposal, usages, …); demo seed in one transaction; sweep deletes
  `isDemo` projects by age as well as by share.
- **Indexes**: Ticket.boardId, Ticket.milestoneId, OrgPost.authorUserId /
  projectId, HumanTask.projectId / ownerUserId, Dispatch.ownerUserId.
- **Retention**: 90-day sweep for ToolCallEvent, AnthropicUsageEvent,
  ActivityEvent; stats via `groupBy`; `take` on every list query.
- **Spend attribution**: `AnthropicUsageEvent.userId` + `keySource`
  (byok | app); cost widget per viewer; admin view of app-key spend by user.
- **Headers**: CSP baseline, `frame-ancestors 'none'`, HSTS, nosniff via
  next.config `headers()`.
- **Local mode**: `pnpm start` binds 127.0.0.1; middleware rejects
  state-changing requests with a foreign Origin and non-loopback Host;
  1Password populate validates the path against a registered project.
- **Tasks**: explicit priority ranking.

## AC → tests
- Linear re-import into a second board leaves the first board's tickets
  untouched; demo sweep succeeds with FeatureProposal rows present.
- Migration test asserts the indexes; retention sweep fixture.
- Usage row carries userId/keySource for each call site.
- Header snapshot; foreign-Origin POST → 403 in local mode.
