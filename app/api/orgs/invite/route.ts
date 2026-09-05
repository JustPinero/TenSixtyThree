/**
 * 55.1 — invite a member into the active org. Re-inviting the same email
 * replaces the pending row (cancelPendingInvitationsOnReInvite
 * convention). The 54.1 gate + 55.1 auto-accept do the rest when they
 * sign in.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { requireMembership } from "@/lib/orgs";
import { sendEmail, escapeHtml } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 3600_000;
const ROLES = ["member", "admin"];

export async function POST(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const orgId = session.session.activeOrganizationId;
  if (!orgId) {
    return NextResponse.json(
      { error: "No active organization" },
      { status: 400 },
    );
  }
  const member = await requireMembership(prisma, session.user.id, orgId);
  if (!member) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = await request.json();
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = ROLES.includes(body.role) ? body.role : "member";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  await prisma.invitation.updateMany({
    where: { organizationId: orgId, email, status: "pending" },
    data: { status: "canceled" },
  });
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: orgId,
      email,
      role,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      inviterId: session.user.id,
    },
  });

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const base = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  await sendEmail({
    to: email,
    subject: `You're invited to ${org?.name ?? "an organization"} on TenSixtyThree`,
    html: `<p>You've been invited to <b>${escapeHtml(org?.name ?? "an organization")}</b>.</p><p><a href="${base}/signin">Sign in with this email</a> using the "Email code" option — membership is applied automatically. Valid 7 days.</p>`,
    text: `You're invited to ${org?.name ?? "an organization"} on TenSixtyThree. Sign in at ${base}/signin with this email (Email code option). Valid 7 days.`,
  });

  return NextResponse.json({ invitation });
}
