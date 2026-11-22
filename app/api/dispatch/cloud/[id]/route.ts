/**
 * 52.3 — one cloud run in full: dispatch row, outcome, and the event
 * stream the runner wrote while executing. Visibility follows the
 * project (55.2); strangers and unknown ids get the same 404.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn } from "@/lib/access";
import { canSeeProject } from "@/lib/project-access";
import { PUBLIC_DISPATCH_SELECT, publicDispatch } from "@/lib/runner/public-dispatch";

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
    select: { ...PUBLIC_DISPATCH_SELECT, projectId: true, outcome: true },
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
      // 66.2 [1.0.D4] — indexed column; the details match covers rows
      // written before the column existed.
      OR: [
        { dispatchId: dispatch.id },
        { dispatchId: null, details: { contains: `"dispatchId":"${dispatch.id}"` } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, summary: true, createdAt: true },
  });

  const { outcome, projectId: _projectId, ...row } = dispatch;
  void _projectId;
  return NextResponse.json({ dispatch: publicDispatch(row), outcome, events });
}
