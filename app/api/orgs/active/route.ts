/** 54.3 — switch the active organization (membership-checked). */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { setActiveOrg } from "@/lib/orgs";

export async function PUT(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const body = await request.json();
  const organizationId =
    typeof body.organizationId === "string" ? body.organizationId : "";
  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId required" },
      { status: 400 },
    );
  }
  try {
    await setActiveOrg(prisma, {
      sessionToken: session.session.token,
      userId: session.user.id,
      organizationId,
    });
  } catch {
    return NextResponse.json(
      { error: "Not a member of that organization" },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
