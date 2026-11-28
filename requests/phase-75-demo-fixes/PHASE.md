# Phase 75 — demo fixes (review items 1, 2, 3, 5, 9, 10, 13)

Source: 2026-11-25 remote UI/demo review. Small, user-visible defects that
make the demo look unfinished.

- **Operator widgets off the demo dashboard.** The shell context learns
  `isDemo` (server-resolved, like `isOperator`). Quarantine banner and the
  dispatch-queue strip are local-install only; the quarantine banner also
  ignores non-OK / malformed bodies (it rendered "undefined … quarantined"
  from a 403 body). Cost widget hidden for demo visitors.
- **Team page in the demo.** `GET /api/orgs/members` allows demo viewers
  read-only (`canManage: false`); PATCH/DELETE still refuse. The workspace
  hides Create-org and Invite for demo visitors and says why.
- **Demo assistant markdown.** Scripted replies keep bold on one line (no
  raw `**`).
- **Signed-in visitors to /welcome** go to `/` (middleware); the landing
  page never renders inside app chrome.
- **Naming.** Demo org is "Demo Fleet" (no hash; slug stays unique).
  Overseer page drops the duplicated "— Sprint Planning" bar label on the
  full page; the subtitle reads "Overseer · fleet dispatcher".
- **Example prompts send** on click.
- **A11y.** Reminder dismiss buttons and the reminder toggle get names.

## AC → tests
- deployment-mode / dashboard: demo viewer → no cost widget, no queue strip,
  no quarantine banner; quarantine banner renders nothing on a 403 body.
- members route: demo GET 200 with canManage false; demo PATCH/DELETE 403.
- org-workspace: demo → no invite / create forms.
- route-guard: /welcome + session cookie → redirect "/".
- seedDemo: org name "Demo Fleet".
- overseer-chat: clicking an example POSTs it.
- reminder widget: dismiss buttons have accessible names.
