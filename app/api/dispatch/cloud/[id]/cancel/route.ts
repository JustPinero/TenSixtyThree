/**
 * 67.2 — cancel a cloud run. A queued run ends at once; a running one is
 * flagged (`cancelRequested`) and the runner stops it within its cancel
 * poll, pushing any partial work. Only someone who may drive the project
 * can cancel; everyone else gets the same 404 as an unknown id.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn } from "@/lib/access";
import { canDispatchProject } from "@/lib/project-access";

const TERMINAL = new Set(["completed", "failed", "timeout"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireSignedIn(request, { allowDemo: false });
  if (!access.ok) return access.response;
  const { id } = await params;
  const row = await prisma.dispatch.findUnique({
    where: { id },
    select: { id: true, projectId: true, runtime: true, status: true },
  });
  if (
    !row ||
    row.runtime !== "cloud" ||
    !(await canDispatchProject(prisma, access.viewer.userId, row.projectId))
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (TERMINAL.has(row.status)) {
    return NextResponse.json({ error: "This run has already finished" }, { status: 409 });
  }

  // Queued: end it now — conditional, in case a runner claims it this instant.
  const ended = await prisma.dispatch.updateMany({
    where: { id, status: "queued" },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorMessage: "Cancelled by request before it started.",
      cancelRequested: true,
    },
  });
  if (ended.count === 0) {
    await prisma.dispatch.updateMany({
      where: { id, status: "started" },
      data: { cancelRequested: true },
    });
  }
  return NextResponse.json({ ok: true, cancelled: ended.count === 1 ? "now" : "requested" });
}
