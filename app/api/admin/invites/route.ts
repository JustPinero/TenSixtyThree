/**
 * 54.1 — independent-user invites (admin only).
 *
 * Org members are invited through the organization plugin; this surface
 * covers users who belong to no org. Rows are consumed by the
 * user.create.before invite gate (lib/auth.ts → lib/invite-gate.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { sendEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function requireAdmin(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return {
      ok: false as const,
      status: 401,
      error: "Authentication required",
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "admin") {
    return { ok: false as const, status: 403, error: "Admin only" };
  }
  return { ok: true as const, userId: session.user.id };
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

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
      invitedById: gate.userId,
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
  const gate = await requireAdmin(request);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }
  const invites = await prisma.userInvite.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ invites });
}
