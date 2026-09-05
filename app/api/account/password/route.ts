/**
 * 54.1 — password-after-first-login.
 *
 * Invited users sign in with an emailed code (no credential account yet),
 * then set a password here. GET powers the "set a password" prompt; POST
 * creates the credential account via Better Auth's server-only
 * setPassword. Email-code sign-in keeps working afterward.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getServerSession } from "@/lib/auth-helpers";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export async function GET(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const credential = await prisma.account.findFirst({
    where: { userId: session.user.id, providerId: "credential" },
    select: { id: true },
  });
  return NextResponse.json({ hasPassword: credential !== null });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const body = await request.json();
  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  if (
    newPassword.length < MIN_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return NextResponse.json(
      {
        error: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  await auth.api.setPassword({
    body: { newPassword },
    headers: request.headers,
  });

  return NextResponse.json({ ok: true });
}
