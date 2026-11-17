/**
 * 54.1 — independent-user invites (admin only).
 *
 * Org members are invited through the organization plugin; this surface
 * covers users who belong to no org. Rows are consumed by the
 * user.create.before invite gate (lib/auth.ts → lib/invite-gate.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn, type UserViewer } from "@/lib/access";
import { sendEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Admin ACCOUNT required (invitedById needs a user id), never a demo. */
function adminOnly(viewer: UserViewer): NextResponse | null {
  if (viewer.isDemo) {
    return NextResponse.json({ error: "Not available in demo mode" }, { status: 403 });
  }
  if (!viewer.isAdmin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const gate = await requireSignedIn(request);
  if (!gate.ok) return gate.response;
  const denied = adminOnly(gate.viewer);
  if (denied) return denied;

  const body = await request.json();
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const pending = await prisma.userInvite.findFirst({
    where: {
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) {
    return NextResponse.json(
      { error: "A pending invite already exists for that email" },
      { status: 409 },
    );
  }

  const invite = await prisma.userInvite.create({
    data: {
      email,
      invitedById: gate.viewer.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  const base = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  await sendEmail({
    to: email,
    subject: "You're invited to TenSixtyThree",
    html: `<p>You've been invited to TenSixtyThree.</p><p><a href="${base}/signin">Sign in with this email</a> using the "Email code" option — your invite is valid for 7 days.</p>`,
    text: `You're invited to TenSixtyThree. Sign in at ${base}/signin with this email (Email code option). Valid 7 days.`,
  });

  return NextResponse.json({ invite });
}

export async function GET(request: NextRequest) {
  const gate = await requireSignedIn(request);
  if (!gate.ok) return gate.response;
  const denied = adminOnly(gate.viewer);
  if (denied) return denied;
  const invites = await prisma.userInvite.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ invites });
}
