/**
 * Phase 68.3 — who am I, for the account menu and the set-password
 * prompt. Never returns key material: only whether a BYOK key is stored.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn } from "@/lib/access";

export async function GET(request: NextRequest) {
  const access = await requireSignedIn(request);
  if (!access.ok) return access.response;
  const { userId } = access.viewer;
  const [user, credential] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        role: true,
        isDemo: true,
        anthropicKeyEnc: true,
      },
    }),
    prisma.account.findFirst({
      where: { userId, providerId: "credential" },
      select: { id: true },
    }),
  ]);
  if (!user)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  return NextResponse.json(
    {
      user: {
        name: user.name,
        email: user.email,
        role: user.role ?? "user",
        isDemo: user.isDemo || access.viewer.isDemo,
      },
      hasPassword: credential !== null,
      hasAnthropicKey: user.anthropicKeyEnc !== null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
