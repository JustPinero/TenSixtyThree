/** 54.3 — my organizations: list + create. Session-required. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { createOrg, listUserOrgs } from "@/lib/orgs";

export async function GET(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  const orgs = await listUserOrgs(prisma, session.user.id);
  return NextResponse.json({
    orgs,
    activeOrganizationId: session.session.activeOrganizationId,
  });
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
