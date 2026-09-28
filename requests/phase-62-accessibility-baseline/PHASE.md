# Phase 62 — Accessibility baseline

Source: the 2026-09-28 styling review + live in-page measurement on www.
Phase 61 fixes what is invisible to everyone; this fixes what is unusable
for keyboard, screen-reader and motion-sensitive users. DeepFinLabs is the
first real org tenant — an enterprise a11y question is a matter of time.

Counts are VERIFIED: `focus:outline-none` 21x, `focus-visible` 0x,
`focus:ring` 0x, `role="switch"` 0x, `aria-checked` 0x,
`prefers-reduced-motion` 0x. Live: 50 of 50 interactive elements on the
dashboard had outline:none and no replacement ring.

## 62.1 — Nothing in the app shows keyboard focus
19 of the 21 `focus:outline-none` substitute only `focus:border-cyan` — a
1px border-color change that is itself 2.63-4.09:1 in light packs. TWO
provide no replacement at all: app/components/command-panel.tsx:216 and
app/components/overseer-chat.tsx:1095 — the command palette and the
Overseer chat input, the two most keyboard-driven controls in the product.
- Add a `.focus-ring` component-layer utility in globals.css:
  `focus-visible:outline-2 outline-offset-2 outline-cyan` (never
  `focus:`; mouse users should not see it).
- Apply to every interactive element; after 63.1 extracts primitives this
  is a handful of edits instead of 110.
- Keep `focus:outline-none` ONLY where a replacement ring exists.

## 62.2 — Toggles announce as unlabeled "button" with no state
5 switches are a bare `<button>` wrapping a decorative `<div>` knob:
app/settings/page.tsx:378,418,461, components/wizard/config-step.tsx:39,
components/wizard/github-step.tsx:16. No accessible name, no state.
A screen-reader user cannot tell whether notifications, voice, or the PR
workflow are on.
- `role="switch" aria-checked={enabled} aria-label={label}` on each.
- Extract a single `<Toggle>` primitive (feeds 63.1).

## 62.3 — 12 form labels are decorative only
43 `<label>` exist; 31 are correctly associated (wrap the control or use
htmlFor). These 12 have no control inside and no htmlFor, so the field
announces as "edit text, blank": settings/page.tsx:715,733,893,917,935,
953,993; reports/page.tsx:104,133; wizard/name-step.tsx:31,49;
wizard/config-step.tsx:69. Affected fields include the API-key input,
voice rate, and report scope.
- Add htmlFor/id pairs.
- Icon buttons at overseer-chat.tsx:823,849,1013 rely on `title` only —
  add aria-label (MED).

## 62.4 — Keyboard traps and dead interactive elements
- app/components/sidebar.tsx:281: `<div onClick>` mobile scrim, no role,
  no tabIndex, no key handler — keyboard users cannot dismiss the drawer.
  Fix: `aria-hidden` on the scrim + Escape handler on the `<aside>` +
  focus trap while open.
- app/components/wizard/template-step.tsx:75: has role and tabIndex but
  NO onKeyDown — Enter/Space do not select a template. Fix: key handler,
  or make it a real `<button>`.

## 62.5 — Permanently animating dashboard
`prefers-reduced-motion` is honored nowhere. 25 infinite-animation class
uses (pulse-healthy 10, pulse-warning 9, pulse-blocked 5, pulse-session 1)
plus `body::before` `grid-drift 30s infinite` (globals.css:440) and the
`tile-3d` hover transform. WCAG 2.2.2.
- One block in globals.css:
  `@media (prefers-reduced-motion: reduce) { *,::before,::after {
   animation:none!important; transition:none!important } }`
- Keep the health-status COLOR when the pulse stops (the animation must
  not be the only signal).

## 62.6 — CI cannot see any of this
eslint-config-next/core-web-vitals does NOT enable
`jsx-a11y/click-events-have-key-events`, `label-has-associated-control`,
or `no-static-element-interactions` — which is exactly why 62.2/62.3/62.4
survived to production.
- Add `eslint-plugin-jsx-a11y` with the strict preset; fix or explicitly
  disable-with-reason each hit. Lands in scripts/validate.sh, so it only
  has teeth once phase 57.2 revives CI.

## AC -> tests
- 62.1a every element carrying `focus:outline-none` also carries a
  `focus-visible:` ring (repo-scan test, 0 exceptions).
- 62.1b the focus ring vs its background >= 3:1 in all 12 packs (reuses
  the 61.2a contrast helper).
- 62.2a each of the 5 toggles exposes role=switch + aria-checked
  reflecting state (RTL render + toggle -> aria-checked flips).
- 62.2b `<Toggle>` is keyboard-operable: Space and Enter both fire onChange.
- 62.3a every input/select/textarea in app/** has an accessible name
  (RTL `getByLabelText` for the 12 named fields).
- 62.4a sidebar: Escape closes the drawer; focus returns to the opener.
- 62.4b template-step: Enter and Space select (fireEvent.keyDown).
- 62.5a jsdom with `prefers-reduced-motion: reduce` -> computed
  animation-name none on a pulse element.
- 62.5b health status remains distinguishable without animation (the
  status color/label assertion, not the class).
- 62.6a eslint with jsx-a11y strict exits 0 on app/ and lib/.
