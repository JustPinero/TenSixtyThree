# Phase 55 — Close the loops: invites end-to-end, project tenancy

Justin (2026-09-05): "keep building." Two structural gaps from 54 plus the
UIs that make 54's features reachable without curl.

## 55.1 — Org-invite auto-accept + invite UIs
GAP: the 54.1 gate lets an org-invited email CREATE an account, but
nothing accepts the org invitation afterward — the user lands memberless.
- lib/invite-accept.ts: acceptPendingInvitations(prisma, userId, email) —
  pending, unexpired, email-matched (case-insensitive) Invitation rows →
  Member rows (role from the invitation), invitation marked accepted;
  idempotent; returns count. Called from /api/orgs GET (first thing a
  signed-in session touches).
- OrgWorkspace: "Invite member" form (email + role) → POST /api/orgs/invite
  (creates org-plugin Invitation via prisma + sends the 54.2 email).
- Settings: admin-only "Invites" panel over /api/admin/invites.
## 55.2 — Project ownership ([54.D1])
- Project.ownerUserId String? — null = operator fleet (visible to admins
  and local mode), owned = creator + members of orgs it's shared to.
- lib/project-access.ts: visibleProjectFilter(session, memberships,
  isAdmin) → Prisma where; canSeeProject for detail/chat routes.
- Wired: /api/projects GET, /api/projects/[slug] GET/PATCH, project chat.
- Share-to-org button on the project page (POST /api/orgs/projects).

## AC → tests
- 55.1a acceptPendingInvitations: pending+fresh → member with role,
  idempotent, expired/canceled ignored, case-insensitive → lib rig test
- 55.1b /api/orgs/invite: member-only, email validated, duplicate pending
  handled (cancelPendingInvitationsOnReInvite convention: replace) → route test
- 55.2a visibleProjectFilter matrix: local/no session → all; admin → all
  non-demo + own; user → owned + org-shared; demo → demo only → lib test
- 55.2b routes enforce canSeeProject (404 for strangers) → route test
- UIs thin over tested cores (tsc/lint).
