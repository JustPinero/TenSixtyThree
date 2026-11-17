/** 54.3 — share/unshare projects into the active org; list shared. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { activeOrgContext } from "@/lib/org-context";
import { canSeeProject } from "@/lib/project-access";

export async function GET(request: NextRequest) {
  const ctx = await activeOrgContext(prisma, request);
  if (!ctx.ok) {
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
  const ctx = await activeOrgContext(prisma, request, { allowDemo: false });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = await request.json();
  const projectId = typeof body.projectId === "number" ? body.projectId : null;
  if (projectId === null) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  // Bughunt 1.0 (critical): Project.id is a sequential Int — sharing must
  // require the caller to be able to SEE the project, not just guess its id.
  // Strangers get the same 404 as a missing project.
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (
    !project ||
    !(await canSeeProject(prisma, ctx.session.user.id, project.id))
  ) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  // S7 — sharing into a new org is the OWNER's decision (or a site
  // admin's). Admins of an org it is already shared into must not be able
  // to carry it into orgs of their own.
  const me = await prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { role: true },
  });
  if (project.ownerUserId !== ctx.session.user.id && me?.role !== "admin") {
    return NextResponse.json(
      { error: "Only the project's owner can share it" },
      { status: 403 },
    );
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
  const ctx = await activeOrgContext(prisma, request, { allowDemo: false });
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = await request.json();
  const projectId = typeof body.projectId === "number" ? body.projectId : null;
  if (projectId === null) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  // S14 — unsharing from THIS org: an owner/admin of this org, the
  // project's owner, or a site admin.
  const [membership, me, project] = await Promise.all([
    prisma.member.findFirst({
      where: { organizationId: ctx.orgId, userId: ctx.session.user.id },
      select: { role: true },
    }),
    prisma.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { role: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerUserId: true },
    }),
  ]);
  const orgManager =
    membership?.role === "owner" || membership?.role === "admin";
  const isOwner = project?.ownerUserId === ctx.session.user.id;
  if (!orgManager && !isOwner && me?.role !== "admin") {
    return NextResponse.json(
      { error: "Only the project's owner or an org admin can unshare it" },
      { status: 403 },
    );
  }
  await prisma.orgProjectShare.deleteMany({
    where: { organizationId: ctx.orgId, projectId },
  });
  return NextResponse.json({ ok: true });
}
