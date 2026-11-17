# Phase 72 — UI polish

Source: deep review (F9, F16, F19, F23, F29, F30, browser pass). Tour and
responsive work lives in phase 71.

- **Kanban**: ticket detail (edit title/description/priority/assignee/
  milestone, delete); `KeyboardSensor` + "Move to…" menu; draft kept until
  the POST succeeds; refetch on a failed drag; tickets have accessible names.
- **Sign-in**: form submit on Enter; email locked after a code is sent with
  "use a different email"; "Code sent" confirmation; `?error=` rendering for
  OAuth/invite-gate rejections; try/finally on every busy flag.
- **Double-submit guards**: custom command Enter, cloud dispatch button.
- **Empty states**: Templates page; Knowledge gaps shown as neutral
  suggestions, not red [HIGH] alerts, when the base is empty.
- **Observability pages** use the theme tokens and shared primitives.
- **Settings**: toggles via `useSyncExternalStore`; theme set in a layout
  effect (no flash); Playbook save reports failure.
- **Activity log** timestamps include the date when not today.

## AC → tests
- Ticket edit/delete/keyboard-move component + route tests.
- Sign-in flow tests for each edge case.
- Double Enter / double click → one request.
- Empty-state renders; theme-token guard covers app/observability.
