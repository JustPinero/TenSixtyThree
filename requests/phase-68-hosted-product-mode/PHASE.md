# Phase 68 — Hosted product mode

Source: deep review (F3, F11, F13-F15, F20-F22, F25, F26, browser pass).
The hosted app currently shows a local operator's console to invited users.

## 68.1 — Mode-aware shell
- One `deploymentMode()` (local | hosted) + `<LocalOnly>` / nav filtering:
  hide Scan, Harvest All, Resume All, platform badge, fleet-drift panel,
  local Dispatch, 1Password/env panel, Integrations, Brains, Playbook,
  Templates on hosted (or label them "local install only").
- Signed-out shell: /signin renders without the app sidebar; a short public
  landing page explains the product and leads to the demo.
## 68.2 — A hosted user can own a project
- "Connect a GitHub repo" flow (owner/repo → Project with `ownerUserId`,
  `githubRepo`), wizard stamps `ownerUserId`; first-run dashboard: connect a
  repo / join an org / try the Overseer — distinct from "filters match
  nothing" and "failed to load".
## 68.3 — Account
- Sidebar account menu: who am I, sign out, change password, API key (BYOK)
  entry point. "Exit demo" ends the demo session server-side.
- Set-password prompt: never for demo; dismissal persists.
## 68.4 — Orgs
- Members + pending invites list, revoke, role change; org-scoped board and
  milestone creation (makes Linear sync reachable); switcher honors failures.
## 68.5 — One name
- Persona name/portrait everywhere "Delamain" is hardcoded (chat label, tab
  title, footer, notifications, settings copy); generic example prompts;
  About box facts (Postgres) and env var names; model list from
  `lib/model-config.ts` only.

## AC → tests
- Nav/route snapshot per mode; signed-out render has no nav links.
- Connect-repo creates an owned project the user sees; empty-state variants.
- Sign-out clears the session; demo exit invalidates the demo cookie.
- Members list/role/revoke route + component tests; org board creation.
- String guard test: no "Delamain"/"Cascade"/"SQLite" literals in
  user-visible components outside the persona registry.
