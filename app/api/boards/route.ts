/** 54.4 — my boards: personal + active-org. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { createBoard } from "@/lib/boards";
import { requireMembership } from "@/lib/orgs";

export async function GET(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  // Security review 54.4: re-verify membership — a stale
  // activeOrganizationId (user removed from the org) must not leak
  // that org's boards.
  let orgId = session.session.activeOrganizationId;
  if (orgId && !(await requireMembership(prisma, session.user.id, orgId))) {
    orgId = null;
  }
  const boards = await prisma.board.findMany({
    where: {
      OR: [
        { ownerUserId: session.user.id },
        ...(orgId ? [{ organizationId: orgId }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ boards });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const scope = body.scope === "org" ? "org" : "personal";
  if (name.length < 1 || name.length > 80) {
    return NextResponse.json({ error: "name must be 1-80 chars" }, { status: 400 });
  }
  if (scope === "org") {
    const orgId = session.session.activeOrganizationId;
    if (!orgId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }
    const member = await requireMembership(prisma, session.user.id, orgId);
    if (!member) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const board = await createBoard(prisma, { name, organizationId: orgId });
    return NextResponse.json({ board });
  }
  const board = await createBoard(prisma, {
    name,
    ownerUserId: session.user.id,
  });
  return NextResponse.json({ board });
}
