# Phase 63 — UI primitives, readability, and the remaining UX defects

Source: the 2026-09-28 styling review + live walkthrough. 61 and 62 fix
correctness; this removes the reason those defects were able to spread,
then clears the rest of the list.

## 63.1 — There are no UI primitives (this is the root cause)
app/components/ contains ZERO base primitives — no Button, Card, Input,
Badge, Panel. Instead: 510 distinct static className literals, 82 repeated
3+ times; 34 distinct `<button>` class strings of which 30 are used
exactly once; three separately hand-rolled badges (attention-badge.tsx,
platform-badge.tsx, advisory-badge.tsx).
Worst repeats: `text-xs font-mono text-space-500` 22x; the input recipe
`bg-space-900 border border-space-600 text-text-bright
placeholder:text-space-500 focus:border-cyan focus:outline-none` 19x
VERBATIM across 13 files; the section heading `text-sm font-mono font-bold
text-cyan uppercase tracking-wider` 9x (+8 with mb-4); the card
`p-4 border border-space-600 bg-space-800 space-y-3` 8x.
This is why 61.2 needs 155 edits and 62.1 needs 110 — a defect in a
duplicated recipe has to be fixed everywhere, so it never is.
- Extract `<Button>` (variant: primary/ghost/danger), `<Panel>`,
  `<Field>` (label+input+error, feeds 62.3), `<SectionHeading>`,
  `<Badge>` (absorbs the three badge components), `<Toggle>` (from 62.2).
- Or a `.btn`/`.input`/`.panel` component-layer class in globals.css
  where a React component would be overkill.
- Retires ~120 duplicated literals and makes future focus/contrast fixes
  one-liners.

## 63.2 — Type is too small to read
`text-[10px]` 84x, plus text-[11px] x3, text-[9px], text-[8px] = 89
sub-12px declarations, with no token. Arbitrary bracket values overall:
112 total, 27 distinct (colors are clean: 0 `[#hex]` outside sidebar).
- Add `--text-micro: 0.6875rem` (11px) to `@theme`; replace the 89 sites.
- Anything that is body-adjacent copy (not a dense telemetry table) goes
  to `text-xs` (12px) minimum.

## 63.3 — The morning briefing renders raw markdown (live finding)
VERIFIED on the production dashboard: the briefing panel is a `<div>` with
`white-space: pre-wrap` printing literal `## Good morning`,
`**Quick stats:**`, `**Needs your attention:**`. The single most
prominent panel on the landing screen shows unrendered source.
- Render markdown (headings, bold, lists) — a small sanitized renderer,
  or store the briefing as structured data and render components. Prefer
  structured data: the generator is ours (lib/ briefing), so it can emit
  sections instead of a markdown blob.
- No `dangerouslySetInnerHTML` without sanitization (repo currently has 0
  uses — keep it that way).

## 63.4 — Missing loading/error boundaries
loading.tsx + error.tsx exist for 9 segments and are MISSING for 8:
app/boards, app/delamain, app/knowledge/lesson/[id], app/observability/
cache, app/observability/tools, app/signin, app/tasks, app/team. There is
also NO app/not-found.tsx and NO app/global-error.tsx.
Symptom: blank frame while loading, and a raw Next error overlay outside
the theme on throw. app/team and app/boards are DB-backed and the most
likely to throw.
- Add the 8 pairs + not-found.tsx + global-error.tsx, themed.

## 63.5 — Responsive: two real breaks
NOTE: the app is in better shape than a raw prefix count suggests (15 of
82 files use sm:/md:/lg:). All 7 multi-column grids carry responsive
prefixes, all 3 tables are wrapped in overflow-x-auto, the w-56 sidebar is
a proper lg:static drawer, and there are no fixed widths above 360px.
(An earlier in-page measurement suggesting ~715px of overflow at 390px was
an artifact: constraining the DOM does not re-evaluate CSS media queries.
Verify mobile with real device emulation before trusting any such number.)
Two genuine defects:
- components/demo-tour.tsx:181 — `Math.min(Math.max(rect.left,16),
  window.innerWidth - 360)` with a w-80 (320px) bubble returns a NEGATIVE
  left below 376px: the public demo's persona tour is off-screen on
  iPhone SE / 360px Android. Fix: `Math.max(16, Math.min(rect.left,
  innerWidth - 336))` + `w-[min(20rem,calc(100vw-2rem))]`.
- app/boards/page.tsx:340 — kanban `flex gap-3 overflow-x-auto`, zero
  breakpoints in the file; columns stay side-by-side on phones.
  Fix: `flex-col lg:flex-row`.
- LOW: filter bars without flex-wrap overflow at 360px
  (app/tasks/page.tsx:142-193, observability/tools/page.tsx:75-121).
Also live-observed: the demo tour popover overlaps the project grid and
the sidebar footer at 1440px — it needs collision-aware placement, not
just clamping.

## 63.6 — Smaller items
- globals.css:544-551 styles only `input[type=text]`, textarea, select.
  The app ships type=password x4, email x3, date x4, range x3 — including
  the sign-in email and password fields (signin/page.tsx:129,149,194),
  which render flat and unthemed next to every other field. Fix:
  `input:not([type=submit]):not([type=checkbox]):not([type=radio])`.
- eslint.config.mjs:19-24 disables `@next/next/no-img-element`
  project-wide with a portrait-specific justification that holds for 1 of
  5 call sites. next/image usage is 0. Scope the disable to
  components/portrait.tsx; move sidebar.tsx:23,363 and
  morning-briefing.tsx:83,102 (static/registry paths) to next/image.
- portrait.tsx:40 takes className from the caller with no intrinsic ratio
  — demo-tour.tsx:206 will jump when a real JPG replaces the SVG fallback.
- Dead code: `--color-space-850` (0 usages — 61.3 will consume it) and the
  class `sidebar-label` (nav-link.tsx:36, defined nowhere).
- The sign-in page renders the full authenticated nav (Dashboard, Boards,
  Settings, ...) to signed-out visitors. Decide: hide it, or keep as a
  deliberate product teaser. Currently it reads as a leak.

## AC -> tests
- 63.1a each primitive has an RTL test: renders children, forwards
  className, variant maps to the right classes, ref forwarding.
- 63.1b a repo-scan test caps duplicated className literals: no static
  class string repeated more than 2x outside components/ui/ (seed the
  threshold at the post-refactor count so it can only improve).
- 63.2a `grep -E 'text-\[(8|9|10|11)px\]' app/` returns 0.
- 63.3a the briefing renders headings/bold as elements, not literal `##`
  or `**` (RTL: getByRole('heading') present, no '##' in textContent).
- 63.3b no dangerouslySetInnerHTML introduced (repo scan stays 0).
- 63.4a every route segment under app/ has loading.tsx + error.tsx
  (filesystem test); not-found.tsx and global-error.tsx exist.
- 63.4b error.tsx renders the themed shell, not a bare string.
- 63.5a demo-tour clamp: at innerWidth 320/360/375 the computed left is
  >= 16 and left+width <= innerWidth-16 (pure function test).
- 63.5b boards column container has flex-col at base and lg:flex-row.
- 63.6a themed input selector covers password/email/date (computed style
  assertion per type).
- 63.6b eslint no-img-element is enabled outside components/portrait.tsx.
