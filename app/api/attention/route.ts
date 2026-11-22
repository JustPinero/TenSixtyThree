import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, requireUser } from "@/lib/access";
import { scopeForViewer, taskWhere } from "@/lib/tenant-scope";

/**
 * GET /api/attention
 *
 * Returns consolidated count of things needing the developer's attention:
 * pending human tasks, blocked projects, CI failures (future), deploy-down (future).
 */
export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    // Phase 66.2 — counts only what the viewer can see.
    const scope = await scopeForViewer(prisma, access.viewer);
    const [pendingTasks, blockedProjects] = await Promise.all([
      prisma.humanTask.count({
        where: { AND: [taskWhere(scope), { status: "pending" }] },
      }),
      prisma.project.count({
        where: { AND: [scope.projectWhere, { health: "blocked" }] },
      }),
    ]);

    const total = pendingTasks + blockedProjects;

    return NextResponse.json({
      total,
      breakdown: {
        pendingTasks,
        blockedProjects,
      },
    });
  } catch (error) {
    return jsonError(error, "attention");
  }
}
