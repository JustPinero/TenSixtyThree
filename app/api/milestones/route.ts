/** 54.4 — roadmap milestones: personal or active-org scoped. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { positionAfter } from "@/lib/boards";
import { requireMembership } from "@/lib/orgs";

const STATUSES = ["planned", "in_progress", "shipped"];

export async function GET(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const orgId = session.session.activeOrganizationId;
  const milestones = await prisma.milestone.findMany({
    where: {
      OR: [
        { ownerUserId: session.user.id },
        ...(orgId ? [{ organizationId: orgId }] : []),
      ],
    },
    orderBy: { position: "asc" },
  });
  return NextResponse.json({ milestones });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > 200) {
    return NextResponse.json({ error: "title 1-200 required" }, { status: 400 });
  }
  const scope = body.scope === "org" ? "org" : "personal";
  let owner: { organizationId?: string; ownerUserId?: string };
  if (scope === "org") {
    const orgId = session.session.activeOrganizationId;
    if (!orgId) {
      return NextResponse.json({ error: "No active organization" }, { status: 400 });
    }
    if (!(await requireMembership(prisma, session.user.id, orgId))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    owner = { organizationId: orgId };
  } else {
    owner = { ownerUserId: session.user.id };
  }
  const last = await prisma.milestone.findFirst({
    where: owner,
    orderBy: { position: "desc" },
  });
  const milestone = await prisma.milestone.create({
    data: {
      ...owner,
      title,
      description:
        typeof body.description === "string" ? body.description.slice(0, 5000) : "",
      ...(body.targetDate ? { targetDate: new Date(body.targetDate) } : {}),
      position: positionAfter(last?.position ?? null),
    },
  });
  return NextResponse.json({ milestone });
}

async function canTouch(
  request: NextRequest,
  id: string
): Promise<{ ok: true } | { status: 401 | 403 | 404 }> {
  const session = await getServerSession(prisma, request.headers);
  if (!session) return { status: 401 };
  const milestone = await prisma.milestone.findUnique({ where: { id } });
  if (!milestone) return { status: 404 };
  if (milestone.ownerUserId) {
    return milestone.ownerUserId === session.user.id
      ? { ok: true }
      : { status: 404 };
  }
  if (milestone.organizationId) {
    const member = await requireMembership(
      prisma,
      session.user.id,
      milestone.organizationId
    );
    return member ? { ok: true } : { status: 404 };
  }
  return { status: 404 };
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  const gate = await canTouch(request, id);
  if (!("ok" in gate)) {
    return NextResponse.json({ error: "Not available" }, { status: gate.status });
  }
  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${STATUSES.join(", ")}` },
      { status: 400 }
    );
  }
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim().slice(0, 200);
  }
  if (typeof body.description === "string") {
    data.description = body.description.slice(0, 5000);
  }
  if (typeof body.status === "string") data.status = body.status;
  if (body.targetDate === null) data.targetDate = null;
  else if (body.targetDate) data.targetDate = new Date(body.targetDate);
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    data.position = body.position;
  }
  const milestone = await prisma.milestone.update({ where: { id }, data });
  return NextResponse.json({ milestone });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  const gate = await canTouch(request, id);
  if (!("ok" in gate)) {
    return NextResponse.json({ error: "Not available" }, { status: gate.status });
  }
  await prisma.milestone.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
