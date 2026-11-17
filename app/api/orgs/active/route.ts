/** 54.3 — switch the active organization (membership-checked). */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn } from "@/lib/access";
import { setActiveOrg } from "@/lib/orgs";

export async function PUT(request: NextRequest) {
  const access = await requireSignedIn(request);
  if (!access.ok) return access.response;
  const session = access.viewer.session;
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
