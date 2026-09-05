/**
 * 54.1 — the invite-only gate.
 *
 * Pure decision core behind Better Auth's `databaseHooks.user.create.before`
 * — the single choke point that covers every account-creation path (OAuth,
 * email code, password). A user may be created only when their email holds
 * a live invitation (org or independent) or sits on the admin bootstrap
 * allowlist (ADMIN_EMAILS — how the first account gets in).
 */

export interface OrgInviteRow {
  email: string;
  status: string; // Better Auth organization plugin: pending | accepted | rejected | canceled
  expiresAt: Date;
}

export interface UserInviteRow {
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
}

export interface UserCreationInput {
  email: string;
  now: Date;
  /** Bootstrap allowlist (ADMIN_EMAILS env) — always allowed. */
  adminEmails: string[];
  orgInvites: OrgInviteRow[];
  userInvites: UserInviteRow[];
}

export type UserCreationDecision =
  | { allowed: true; via: "admin" | "org-invite" | "user-invite" }
  | { allowed: false };

export function decideUserCreation(
  input: UserCreationInput,
): UserCreationDecision {
  const email = input.email.trim().toLowerCase();

  if (input.adminEmails.some((a) => a.trim().toLowerCase() === email)) {
    return { allowed: true, via: "admin" };
  }

  const liveOrgInvite = input.orgInvites.some(
    (i) =>
      i.email.trim().toLowerCase() === email &&
      i.status === "pending" &&
      i.expiresAt.getTime() > input.now.getTime(),
  );
  if (liveOrgInvite) return { allowed: true, via: "org-invite" };

  const liveUserInvite = input.userInvites.some(
    (i) =>
      i.email.trim().toLowerCase() === email &&
      i.acceptedAt === null &&
      i.expiresAt.getTime() > input.now.getTime(),
  );
  if (liveUserInvite) return { allowed: true, via: "user-invite" };

  return { allowed: false };
}
