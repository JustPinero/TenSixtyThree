# Phase 77 — first impressions (review items 6, 8, 11, 12)

- **Loading placeholders** instead of blank or zeroed content on Boards
  (boards and the active board's columns), Roadmap (no "0 building" before
  data) and Tasks. Shared `PageSkeleton` primitive.
- **Landing page** gains a product picture: a static, accessible mock of the
  dashboard (project cards with health + progress, an assistant exchange,
  a run that ended in a PR), built from markup — no screenshot asset to go
  stale — plus a short "how it works" strip.
- **Settings** gets section navigation (jump links) and portraits become a
  picker of the theme-pack portraits with a preview instead of raw path
  inputs (custom path stays available behind "Use a custom image").
- **Dashboard width**: project grid uses more columns on wide screens; the
  activity column stops leaving a dead zone.

## AC → tests
- Boards / Roadmap / Tasks render a `status` skeleton before data and never
  show "0 building" before the first response.
- Welcome page renders the product preview with an accessible label.
- Settings: section nav links target existing ids; portrait picker sets the
  portrait from a pack.
- Project grid class covers 3+ columns at 2xl (class assertion).
