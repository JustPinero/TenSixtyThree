import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { visibleProjectFilter } from "@/lib/project-access";
import { getAllUnreadCounts } from "@/lib/unread";
import { getAdvisoryStatuses } from "@/lib/advisory-tracker";

export async function GET(request: NextRequest) {
  try {
    // 55.2 — full visibility matrix (owner / org-shared / admin / demo /
    // local) lives in lib/project-access.ts. Resolved BEFORE the fan-out:
    // an `await` inside the Promise.all array serialized everything behind
    // it (1.0 optimize audit).
    const session = await getServerSession(prisma, request.headers);
    const where = await visibleProjectFilter(prisma, session?.user.id ?? null);

    const [projects, unreadCounts, humanTaskCounts] = await Promise.all([
      prisma.project.findMany({ where, orderBy: { lastActivityAt: "desc" } }),
      getAllUnreadCounts(prisma),
      prisma.humanTask.groupBy({
        by: ["projectId"],
        where: { status: "pending" },
        _count: { id: true },
      }),
    ]);
    // Advisory probes reuse the list we already have (no second table scan).
    const advisoryStatuses = await getAdvisoryStatuses(prisma, projects);

    const advisoryMap = new Map(
      advisoryStatuses.map((s) => [s.projectSlug, s])
    );

    const taskCountMap = new Map(
      humanTaskCounts.map((t) => [t.projectId, t._count.id])
    );

    const projectsWithExtras = projects.map((p) => {
      const advisory = advisoryMap.get(p.slug);
      return {
        ...p,
        unreadAuditCount: unreadCounts.get(p.id) || 0,
        hasAdvisory: advisory?.hasAdvisory || false,
        advisoryRead: advisory?.isRead || false,
        pendingHumanTasks: taskCountMap.get(p.id) || 0,
      };
    });

    return NextResponse.json(projectsWithExtras);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
