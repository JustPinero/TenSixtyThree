# Phase 54 — Security, Orgs, Boards, Demo

Justin's brief (2026-09-04): lock the app down (invite-only, no credit
abuse), account creation, orgs (users belong to an org OR are independent;
orgs share projects/progress and communicate goals/objectives/bug
findings/test-hardening requests), roadmaps + milestones, kanban boards
with org ticket-sharing, and a "Try the demo" mode where the user picks an
assistant theme and that persona guides a spotlight tour of every feature.

## Decisions (Justin, 2026-09-04, AskUserQuestion)
- **Credits:** users get BYOK fields (their own Anthropic keys, encrypted);
  the orchestrator stays on Justin's key with NO quota system for now —
  "early stages... if we run out of credits I'll refill them. Cost of doing
  business." (Anthropic workspace hard-cap backstop: parked, not required.)
- **Kanban:** BOTH native boards AND Linear import/sync from the start.
- **Email:** Resend on tensixtythree.com (subdomain mail.tensixtythree.com
  for reputation). Justin's hands: Resend account + SPF/DKIM TXT at GoDaddy.
- **Auth domain:** temporarily tensixtythree-app-production.up.railway.app
  for BETTER_AUTH_URL + OAuth callbacks; flip to www when the cert lands.
  Justin's hands: callback URL edits in GitHub/Google OAuth consoles.

## Research briefs (2026-09-04 agents, sources in session transcript)
- **Invite-only Better Auth:** no single switch — set disableSignUp on
  emailAndPassword / emailOTP / magicLink / social providers AND backstop
  with `databaseHooks.user.create.before` (throws unless a valid invite
  exists — the one choke point covering every path). Org plugin:
  acceptInvitation requires a logged-in matching-email account → flow is
  invite row → email-code sign-in (hook sees pending invite, allows
  creation) → auto-accept post-login. `cancelPendingInvitationsOnReInvite`,
  `requireEmailVerificationOnInvitation`. Independent users: own invite
  table checked in the same hook. Password-after-first-login: server-only
  `auth.api.setPassword` (creates the credential account; changePassword
  won't work before it). Admin plugin for invite/list/ban/impersonate.
  Rate limits ON in prod (built-in; DB storage if we scale out), custom
  rules for OTP endpoints; trustedOrigins is the CSRF posture; secure
  cookies auto in prod.
- **Cost/abuse (parked except BYOK):** metadata.user_id on Messages calls
  (opaque id, no PII); forward request.signal as abortSignal so client
  disconnects cancel upstream streams (audit our routes); never accept
  client-supplied model/max_tokens/system; hard max-iterations (have: 8).
  Quota design (reserve/settle Postgres table) documented for later.
- **Demo:** per-session demo org cloned from a seed template (we own the
  Postgres template-clone pattern), `isDemo` flag checked at choke points
  (email, dispatcher, Anthropic → canned), teardown on expiry; "Try the
  demo" secondary button on /signin; persistent demo banner.
- **Tour:** NextStepjs (MIT, App-Router-native, custom card component →
  persona chat bubble + portrait, multi-route steps, NextStepViewport for
  scrollable panes). Kanban DnD: @dnd-kit/core + sortable. Ticket/column
  models use fractional `position`; Milestone {title, status
  planned|in_progress|shipped, position, targetDate?}.

## Slices
- **54.1 Lockdown** — AUTH_REQUIRED enforced everywhere (route helpers +
  middleware sweep), invite-only gate (flags + user.create.before hook),
  admin plugin + invite UI, first-login set-password prompt (email code
  remains valid), OTP/login rate-limit rules, trustedOrigins, session
  config. Invite table for independent users.
- **54.2 Email + BYOK** — Resend wiring (invite + OTP templates), DNS
  record prep for Justin; per-user encrypted Anthropic key (AES-256-GCM,
  key from env), used for that user's chat calls, fallback to app key;
  metadata.user_id + abort-signal audit on all Anthropic call sites.
- **54.3 Orgs** — create/switch UI on the org plugin, org-scoped project
  sharing + progress visibility, typed org feed (goal | objective |
  bug-finding | test-hardening-request | note) attachable to org/project.
- **54.4 Roadmaps + Kanban** — Milestone + Board/Column/Ticket models,
  dnd-kit board UI, ticket sharing/assignment in-org, roadmap view;
  Linear import/sync (API key per org, map Linear issues ↔ tickets).
- **54.5 Demo mode** — demo org template + synthetic seeded fleet, "Try
  the demo" auto-auth, choke-point no-ops, expiry teardown, demo banner.
- **54.6 Guided tour** — NextStepjs, pre-demo assistant picker (theme
  pack), persona-bubble custom card (portrait + optional voice), steps
  covering every showcased feature; fine-tune pass with Justin.

## Justin's legwork (blocking where noted)
1. Resend account + DNS TXT records (blocks 54.2 email sending; 54.1 can
   log invite links to console meanwhile).
2. GitHub + Google OAuth callback URLs → railway.app domain (blocks hosted
   OAuth testing; email-code path testable without it).
3. Railway env updates when we flip BETTER_AUTH_URL (I can do via CLI with
   his logged-in session — confirm before touching prod env).
