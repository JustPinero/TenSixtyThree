/**
 * 1.0 — the one place "which org is this request acting in?" is answered.
 *
 * Was copy-pasted into three org routes; one copy had drifted to be less
 * defensive than the boards route (which re-verifies membership against a
 * stale activeOrganizationId). Every caller now gets the same guarantees:
 * session required, an active org selected, and membership re-verified.
 */
import type { NextRequest } from "next/server";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { getServerSession, type ServerSession } from "./auth-helpers";
import { requireMembership } from "./orgs";

export type OrgContext =
  | { ok: true; session: ServerSession; orgId: string }
  | { ok: false; error: string; status: 400 | 401 | 403 };

export async function activeOrgContext(
  prisma: PrismaClient,
  request: NextRequest
): Promise<OrgContext> {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return { ok: false, error: "Authentication required", status: 401 };
  }
  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return { ok: false, error: "No active organization", status: 400 };
  }
  const member = await requireMembership(prisma, session.user.id, orgId);
  if (!member) return { ok: false, error: "Not a member", status: 403 };
  return { ok: true, session, orgId };
}
