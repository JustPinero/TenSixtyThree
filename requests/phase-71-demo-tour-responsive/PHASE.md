# Phase 71 — Demo tour that works at every size + responsive layout

The public demo is the sales surface. Measured 2026-11-16 on production by
loading each tour step in a same-origin iframe at six viewport sizes
(360x640, 390x844, 768x1024, 1024x768, 1280x600, 1366x768):

- **Step 6 (Theme packs) is blocked at all six sizes.** `#tour-themes` sits
  ~1,550px down /settings; nothing scrolls it into view;
  `tourBubblePosition` clamps `top` to `viewport.height - 16`, so the bubble
  renders 16px above the bottom edge and Back / Finish / End tour are
  off-screen. The visitor is stuck: the tour also `router.push`es back to the
  step's route on any navigation.
- Step 2 (Overseer link) below `lg`: the target is inside the off-canvas
  drawer (x = -224..-1). Nothing is highlighted.
- Steps 1/3/4: targets taller than the viewport, so the bubble clamps to
  top-left and sits on top of the target and, below `lg`, on the hamburger.
- No horizontal page scroll should exist; measured overflow at 390px:
  / 495px, /roadmap 262px, /create 270px, /team 161px, /settings 89px,
  /delamain 43px. At 768px: / 117px. At 1024px: / 77px.
- Dashboard at 390px: the two project tiles are outside the viewport
  (reachable only by sideways scroll).
- Targets under 24px: activity-feed project links (97x16), roadmap/team
  project links (15-16px tall), Overseer Conversation/Speaking/Mic (21px),
  settings checkboxes/radios (13x13), "← Dashboard" link.

No schema change — independent of phase 59.

## 71.1 — Tour placement that cannot strand the visitor
- Before measuring a step: `el.scrollIntoView({ block: "center" })`, then
  measure. Re-measure on `scroll` of `<main>` (the scroll container) and on
  `resize`, via `ResizeObserver` + a passive scroll listener (or adopt
  `@floating-ui/react` `flip()` + `shift({ padding: 16 })` + `autoUpdate`).
- `tourBubblePosition`: measure the real bubble height (ref) instead of the
  220px constant; candidates below → above → beside → overlay; the result
  must satisfy `top + height <= viewport.height - GUTTER` ALWAYS.
- Below `sm`: dock the bubble as a bottom sheet (`fixed inset-x-0 bottom-0`,
  safe-area padding) and only highlight the target.
- Target larger than the viewport: highlight its visible header region, not
  the whole element.
- Missing/hidden target (rect null or off-canvas): centered bubble, no dim.

## 71.2 — Tour steps valid on every breakpoint
- Step 2 below `lg`: open the nav drawer for the step (close on leave), or
  retarget to the hamburger.
- Stop trapping navigation: if the visitor navigates away mid-tour, pause
  and show a "Resume tour" chip instead of pushing them back.
- Escape ends the tour; focus moves into the bubble on each step
  (`aria-modal` is NOT set — the page stays usable).
- Guide picker: usable at 360x640 (2 columns, scrolls, close button).

## 71.3 — No horizontal page scroll, 320px and up (WCAG 1.4.10)
- Shell: `min-w-0` on the content column in app/layout.tsx (a flex child
  defaults to `min-width: auto`, which is what lets page content widen the
  document).
- Dashboard header (app/page.tsx): stack title above controls below `lg`,
  `flex-wrap` the control row; fold Scan / Harvest All / Resume All into one
  actions menu below `sm`.
- Roadmap table: card list below `md` (or a scroll container with a visible
  affordance). Create wizard stepper: compact "Step n of 7" below `sm`.
- Team, settings (range inputs), Overseer header: wrap / `min-w-0` / `w-full`.
- Overseer page height: `flex-1 min-h-0` inside the shell instead of
  `h-[calc(100vh-3rem)]`, so banners never push the input below the fold;
  use `dvh`/`svh`, not `vh`, anywhere a full-height box remains.
- Banners (demo, set-password) wrap and never sit under the hamburger:
  reserve the hamburger's space in the shell rather than `pt-14` on main.

## 71.4 — Targets
- Interactive targets ≥ 24x24 CSS px (WCAG 2.5.8), 44px for primary actions
  on touch widths: padding on inline project links, `.btn-sm` min-height,
  larger hit area on native checkbox/radio.
- Mobile drawer: closes on navigation, `inert` when closed, focus moves in
  on open.

## AC → tests
- 71.1: `lib/tour-position.test.ts` — property-style: for every step target
  fixture × viewport in {320x568, 360x640, 390x844, 768x1024, 1024x768,
  1280x600, 1366x768, 1920x1080}, the bubble rect is fully inside the
  viewport. Includes "target below the fold" and "target taller than
  viewport" and "target off-canvas".
- 71.1/71.2: Playwright `e2e/demo-tour.spec.ts` — run the full tour at
  390x844, 768x1024 and 1366x768; at every step assert Next/Finish and End
  tour are visible and `elementFromPoint` at their center is the button;
  finish the tour; navigate away mid-tour and assert no bounce.
- 71.3: Playwright `e2e/reflow.spec.ts` — for every nav route at 320, 390,
  768 and 1024 wide: `document.documentElement.scrollWidth <= innerWidth`.
  Route list enumerated from the filesystem so a new page is covered.
- 71.4: same spec — every visible interactive element in `<main>` is
  ≥ 24x24 and, scrolled into view, is the topmost element at its center.
