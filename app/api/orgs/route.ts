/** 54.3 — my organizations: list + create. Session-required. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn } from "@/lib/access";
import { createOrg, listUserOrgs } from "@/lib/orgs";
import { acceptPendingInvitations } from "@/lib/invite-accept";

export async function GET(request: NextRequest) {
  const access = await requireSignedIn(request);
  if (!access.ok) return access.response;
  const session = access.viewer.session;
  // 55.1 — first authenticated touch applies any pending org invitations.
  await acceptPendingInvitations(prisma, session.user.id, session.user.email);
  const orgs = await listUserOrgs(prisma, session.user.id);
  return NextResponse.json({
    orgs,
    activeOrganizationId: session.session.activeOrganizationId,
  });
}

export async function POST(request: NextRequest) {
  const access = await requireSignedIn(request, { allowDemo: false });
  if (!access.ok) return access.response;
  const session = access.viewer.session;
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json(
      { error: "Organization name must be 2-80 characters" },
      { status: 400 },
    );
  }
  const org = await createOrg(prisma, { name, ownerId: session.user.id });
  return NextResponse.json({ org });
}
