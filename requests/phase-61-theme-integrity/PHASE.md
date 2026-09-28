# Phase 61 — Theme integrity: the invisible-UI bugs

Justin (2026-09-27): "full styling css, and UI review". Source: the
2026-09-28 styling review (code) + a live walkthrough of www (demo
session, contrast + a11y measured in-page). These four are not polish —
they are text that does not render, or renders at 1.5:1. Do them first;
everything in 62/63 is easier once tokens are honest.

The architecture is SOUND: theming is CSS custom properties (84 vars) +
a `@theme inline` bridge + 12 `[data-theme]` blocks, applied by
lib/theme-pack-apply.ts. There are ZERO string-concatenated class names
(`bg-${x}` = 0 hits) — the classic Tailwind JIT footgun is absent. The
bugs below are wrong VALUES and an incomplete bridge, all central fixes.

## 61.1 — 99 elements render with no color utility at all (CRITICAL)
The `@theme inline` bridge (app/globals.css:397-412) never defines
`--color-text-dim`, `--color-space-400`, `--color-space-300`,
`--color-emerald`. VERIFIED against the built bundle
(.next/static/chunks/*.css): `.text-space-400`, `.text-space-300`,
`.text-text-dim`, `.text-emerald` are NEVER EMITTED, while
`.text-space-500/.text-text/.text-text-bright` are.
Source usages: text-text-dim 52x, text-space-400 45x, text-space-300 1x
(overseer-chat.tsx:1124), text-emerald 1x (overseer-chat.tsx:1131) = 99
elements silently falling back to inherited body color. Worst files:
app/observability/tools/page.tsx (14), observability/cache/page.tsx (11),
knowledge/lesson/[id]/page.tsx (6).
- Add the four tokens to the bridge (`--color-text-dim: var(--text-dim)`,
  `--color-space-400: var(--text-dim)`, `--color-space-300:
  var(--text-secondary)`, `--color-emerald: var(--success)`).
- GUARD (the real deliverable): a test that scans app/**/*.tsx for every
  `(text|bg|border|ring|from|to)-(space|text)-\w+` class, and fails on any
  token absent from the `@theme inline` block. This bug class must never
  return silently.

## 61.2 — A border color used as text 155 times (CRITICAL)
`--color-space-500` maps to `--border-bright`. `text-space-500` is used
155x for timestamps, captions, placeholders. MEASURED in-browser on the
live dashboard: rgb(46,53,80) on rgb(17,22,32) = **1.50:1** (AA needs
4.5). Computed across packs: cyberpunk 1.50, specter 1.57, quiet 1.78,
console 1.86, sunny 2.06, curator 2.37 — every pack fails.
- Introduce `--color-muted` (per-pack, >= 4.5:1 on `--bg-panel`).
- Mechanical replace `text-space-500` -> `text-muted` (155 sites).
  `border-space-500` stays as-is; it is correct for borders.
- Related: `--text-dim` itself fails AA in ALL 12 packs (2.93 sprite ->
  3.91 console). Raise each pack's `--text-dim` to >= 4.5:1 on panel, or
  retire it in favor of `--color-muted`.

## 61.3 — Sidebar hardcoded, invisible in 8 of 12 themes (CRITICAL)
app/components/sidebar.tsx:293 sets
`background: linear-gradient(180deg,#111620,#0c1018,#080b11)` and
`borderRight: 1px solid #242a3d` as INLINE STYLE, bypassing the theme
layer entirely (also violates the CLAUDE.md no-inline-styles rule).
The nav LABELS use theme tokens, so in the 8 light packs light text sits
on a hardcoded near-black gradient: `text-text` measures 1.80-2.47:1 and
active `text-text-bright` 1.07-1.37:1 (sunny 1.09, quiet 1.07, pilot
1.10). The entire navigation is effectively invisible in two-thirds of
the themes. CONFIRMED visually: the Curator pack's sign-in page renders
the logo and all 14 nav items as barely-legible brown on black.
- Replace with `bg-linear-to-b from-space-800 via-space-850 to-space-900
  border-r border-space-600` (uses the existing, already-defined
  `--color-space-850`, currently a dead token with 0 usages).
- Same file:361 `borderTop: "1px solid #1a1e2e"` -> `border-t border-space-600`.

## 61.4 — Per-pack contrast is unenforced; `sprite` is unusable
lib/theme-css.test.ts:61 already pins every registry key to a real CSS
block — the harness exists, it just never asserts contrast.
- `[data-theme="sprite"]`: EVERY semantic color fails AA on its own panel
  (cyan 2.63, amber 1.94, success 2.34, accent 2.37, danger 3.29, info
  3.34). `bg-accent text-space-900` (observability/cache/page.tsx:126,
  tools/page.tsx:126) = 2.13:1 in sprite, 3.27 quiet, 3.50 sage, 3.60 pixel.
- Darken sprite/pixel/sunny semantic hues ~20% L.
- Theme-bypassing default-palette colors that never change with the pack:
  `text-red-400` x3 (settings/page.tsx:636,644,677), `bg-white` x3 toggle
  knobs (settings/page.tsx:386,425,468 — white knob on white panel in
  quiet/pilot/sprite), `text-amber-400`/`amber-300`/`bg-amber-500/10`/
  `border-amber-500/60` x4 -> use `text-danger`, `bg-space-900`, `text-amber`.

## 61.5 — Theme flash + no OS-preference fallback
app/layout.tsx:42 hardcodes `data-theme="dark"`; theme-provider.tsx:38
returns "cyberpunk" as the server snapshot and reads localStorage only
after hydration, with no blocking inline script. Every non-cyberpunk user
gets a full-page flash of dark cyberpunk on EVERY navigation and reload.
There is also no `prefers-color-scheme` fallback anywhere (0 occurrences),
so a first-time visitor on an OS light theme is served dark cyberpunk.
- Inline a pre-hydration script that stamps `data-theme` from localStorage.
- `@media (prefers-color-scheme: light) { :root:not([data-theme]) { ... } }`
  defaulting to the `sunny` pack's vars.

## AC -> tests
- 61.1a token-bridge guard: a test enumerating every space-/text- utility
  in app/**/*.tsx fails when a token is missing from `@theme inline`
  (seed it by temporarily removing one token -> red).
- 61.1b the four tokens resolve to non-empty computed values (jsdom or a
  CSS-parse assertion over globals.css).
- 61.2a `contrastRatio(fg,bg)` helper in lib/ (pure, unit-tested against
  known WCAG pairs: #000/#fff = 21, #777/#fff = 4.48).
- 61.2b for EVERY pack in THEME_PACKS: `--color-muted` on `--bg-panel`
  >= 4.5, `--text-primary`/`--text-secondary` on `--bg-panel` >= 4.5,
  each semantic (cyan/amber/success/danger/info/accent) >= 4.5 -> extend
  lib/theme-css.test.ts. This is the regression net for 61.2/61.4.
- 61.2c `grep text-space-500 app/` returns 0 (lint-style test).
- 61.3a no inline `style={{` in sidebar.tsx; a repo-wide test allowlists
  the 6 legitimate computed-geometry uses (roadmap/page.tsx:66,
  project-tile.tsx:140, org-workspace.tsx:252, demo-tour.tsx:191,203,
  settings/page.tsx:1089) and fails on any new one.
- 61.3b sidebar nav label vs sidebar background >= 4.5:1 in all 12 packs.
- 61.5a the pre-hydration script is present in the rendered layout and
  reads the same storage key theme-provider writes (string-match test).
- 61.5b no-JS / no-storage render falls back to a pack that passes 61.2b.
