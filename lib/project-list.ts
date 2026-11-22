/**
 * Phase 60.2 — the visible-project list, shared by GET /api/projects and
 * the server-rendered dashboard (so first paint carries the fleet with no
 * client round-trip). Visibility is the 55.2 matrix.
 */
import type { PrismaClient } from "@/app/generated/prisma/client";
import { visibleProjectFilter } from "@/lib/project-access";
import { getAllUnreadCounts } from "@/lib/unread";
import { getAdvisoryStatuses } from "@/lib/advisory-tracker";

export async function listVisibleProjects(
  prisma: PrismaClient,
  userId: string | null,
) {
  // Resolved BEFORE the fan-out: an `await` inside the Promise.all array
  // serialized everything behind it (1.0 optimize audit).
  const where = await visibleProjectFilter(prisma, userId);
  const [projects, unreadCounts, humanTaskCounts] = await Promise.all([
    prisma.project.findMany({
      take: 500,
      where,
      orderBy: { lastActivityAt: "desc" },
    }),
    getAllUnreadCounts(prisma),
    prisma.humanTask.groupBy({
      by: ["projectId"],
      where: { status: "pending" },
      _count: { id: true },
    }),
  ]);
  // Advisory probes reuse the list we already have (no second table scan).
  const advisoryStatuses = await getAdvisoryStatuses(prisma, projects);
  const advisoryMap = new Map(advisoryStatuses.map((s) => [s.projectSlug, s]));
  const taskCountMap = new Map(
    humanTaskCounts.map((t) => [t.projectId, t._count.id]),
  );

  return projects.map((p) => {
    const advisory = advisoryMap.get(p.slug);
    return {
      ...p,
      unreadAuditCount: unreadCounts.get(p.id) || 0,
      hasAdvisory: advisory?.hasAdvisory || false,
      advisoryRead: advisory?.isRead || false,
      pendingHumanTasks: taskCountMap.get(p.id) || 0,
    };
  });
}

/** The dashboard tile shape (what the client grid renders). */
export interface DashboardTile {
  slug: string;
  name: string;
  currentPhase: string;
  health: string;
  openDebtCount: number;
  lastActivityAt: string;
  status: string;
  githubRepo: string | null;
  unreadAuditCount: number;
  hasAdvisory: boolean;
  advisoryRead: boolean;
  currentRequest?: string;
  progressScore: number;
  pendingHumanTasks: number;
}

export function toDashboardTiles(
  rows: Awaited<ReturnType<typeof listVisibleProjects>>,
): DashboardTile[] {
  return rows.map((p) => ({
    slug: p.slug,
    name: p.name,
    currentPhase: p.currentPhase,
    health: p.health,
    openDebtCount: 0,
    lastActivityAt: p.lastActivityAt.toISOString(),
    status: p.status,
    githubRepo: p.githubRepo ?? null,
    unreadAuditCount: p.unreadAuditCount,
    hasAdvisory: p.hasAdvisory,
    advisoryRead: p.advisoryRead,
    currentRequest: p.currentRequest ?? undefined,
    progressScore: p.progressScore ?? 0,
    pendingHumanTasks: p.pendingHumanTasks,
  }));
}
