/** 54.3 — share/unshare projects into the active org; list shared. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { requireMembership } from "@/lib/orgs";

async function activeOrgContext(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session)
    return { error: "Authentication required", status: 401 as const };
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return { error: "No active organization", status: 400 as const };
  const member = await requireMembership(prisma, session.user.id, orgId);
  if (!member) return { error: "Not a member", status: 403 as const };
  return { session, orgId };
}

export async function GET(request: NextRequest) {
  const ctx = await activeOrgContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const shares = await prisma.orgProjectShare.findMany({
    where: { organizationId: ctx.orgId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          health: true,
          progressScore: true,
          currentPhase: true,
          lastActivityAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    projects: shares.map((s) => ({ ...s.project, sharedAt: s.createdAt })),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await activeOrgContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = await request.json();
  const projectId = typeof body.projectId === "number" ? body.projectId : null;
  if (projectId === null) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  const existing = await prisma.orgProjectShare.findFirst({
    where: { organizationId: ctx.orgId, projectId },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Already shared to this organization" },
      { status: 409 },
    );
  }
  const share = await prisma.orgProjectShare.create({
    data: {
      organizationId: ctx.orgId,
      projectId,
      sharedById: ctx.session.user.id,
    },
  });
  return NextResponse.json({ share });
}

export async function DELETE(request: NextRequest) {
  const ctx = await activeOrgContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = await request.json();
  const projectId = typeof body.projectId === "number" ? body.projectId : null;
  if (projectId === null) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  await prisma.orgProjectShare.deleteMany({
    where: { organizationId: ctx.orgId, projectId },
  });
  return NextResponse.json({ ok: true });
}
