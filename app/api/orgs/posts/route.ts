/**
 * 54.3 — the org's typed feed: goals, objectives, bug findings,
 * test-hardening requests, notes. Scoped to the session's active org.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { requireMembership } from "@/lib/orgs";

export const POST_TYPES = [
  "goal",
  "objective",
  "bug",
  "test-request",
  "note",
] as const;

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
  const posts = await prisma.orgPost.findMany({
    where: { organizationId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      author: { select: { name: true } },
      project: { select: { name: true, slug: true } },
    },
  });
  return NextResponse.json({ posts });
}

export async function POST(request: NextRequest) {
  const ctx = await activeOrgContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = await request.json();
  const type = typeof body.type === "string" ? body.type : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const projectId = typeof body.projectId === "number" ? body.projectId : null;

  if (!(POST_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${POST_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (title.length < 1 || title.length > 200) {
    return NextResponse.json(
      { error: "title must be 1-200 characters" },
      { status: 400 },
    );
  }
  if (projectId !== null) {
    const share = await prisma.orgProjectShare.findFirst({
      where: { organizationId: ctx.orgId, projectId },
    });
    if (!share) {
      return NextResponse.json(
        { error: "That project isn't shared to this organization" },
        { status: 400 },
      );
    }
  }

  const post = await prisma.orgPost.create({
    data: {
      organizationId: ctx.orgId,
      authorUserId: ctx.session.user.id,
      type,
      title,
      body: text.slice(0, 5000),
      ...(projectId !== null ? { projectId } : {}),
    },
  });
  return NextResponse.json({ post });
}
