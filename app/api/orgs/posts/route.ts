/**
 * 54.3 — the org's typed feed: goals, objectives, bug findings,
 * test-hardening requests, notes. Scoped to the session's active org.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { activeOrgContext } from "@/lib/org-context";

export const POST_TYPES = [
  "goal",
  "objective",
  "bug",
  "test-request",
  "note",
] as const;

export async function GET(request: NextRequest) {
  const ctx = await activeOrgContext(prisma, request);
  if (!ctx.ok) {
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
  const ctx = await activeOrgContext(prisma, request);
  if (!ctx.ok) {
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
