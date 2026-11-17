/**
 * 52.3 — one cloud run in full: dispatch row, outcome, and the event
 * stream the runner wrote while executing. Visibility follows the
 * project (55.2); strangers and unknown ids get the same 404.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn } from "@/lib/access";
import { canSeeProject } from "@/lib/project-access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireSignedIn(request);
  if (!access.ok) return access.response;
  const session = access.viewer.session;
  const { id } = await params;
  const dispatch = await prisma.dispatch.findUnique({
    where: { id },
    include: { outcome: true },
  });
  if (
    !dispatch ||
    dispatch.runtime !== "cloud" ||
    !(await canSeeProject(prisma, session.user.id, dispatch.projectId))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const events = await prisma.activityEvent.findMany({
    where: {
      projectId: dispatch.projectId,
      details: { contains: `"dispatchId":"${dispatch.id}"` },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, summary: true, createdAt: true },
  });

  const { outcome, ...row } = dispatch;
  return NextResponse.json({ dispatch: row, outcome, events });
}
