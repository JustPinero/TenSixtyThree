/**
 * 55.2 — project visibility ([54.D1] closed).
 *
 * Ownership model: `Project.ownerUserId` null = the operator fleet
 * (local single-user mode and hosted admins see it); owned projects are
 * visible to their owner and to members of any org the project is
 * shared into (OrgProjectShare). Demo projects stay behind their own
 * filter (54.5) — callers compose `isDemo` handling separately when the
 * viewer is a demo session.
 */
import type { PrismaClient, Prisma } from "@/app/generated/prisma/client";

async function viewerContext(prisma: PrismaClient, userId: string | null) {
  // Phase 64.2 — "local" is configuration, never a missing session. On
  // the hosted app a null user sees nothing (routes 401 before this).
  if (!userId) {
    return process.env.AUTH_REQUIRED === "true"
      ? ({ kind: "none" } as const)
      : ({ kind: "local" } as const);
  }
  const [user, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isDemo: true },
    }),
    prisma.member.findMany({
      where: { userId },
      select: { organizationId: true, role: true },
    }),
  ]);
  return {
    kind: "user" as const,
    exists: user !== null,
    isAdmin: user?.role === "admin",
    isDemo: user?.isDemo === true,
    orgIds: memberships.map((m) => m.organizationId),
    /** Orgs where the viewer is owner/admin — they may act on shared projects. */
    managedOrgIds: memberships
      .filter((m) => m.role === "owner" || m.role === "admin")
      .map((m) => m.organizationId),
  };
}

export async function visibleProjectFilter(
  prisma: PrismaClient,
  userId: string | null,
): Promise<Prisma.ProjectWhereInput> {
  const viewer = await viewerContext(prisma, userId);
  if (viewer.kind === "none") return { id: { in: [] } };
  if (viewer.kind === "local") return { isDemo: false };
  // S13 — a demo visitor sees only the sandbox shared into their own
  // demo org, not every concurrent visitor's.
  if (viewer.isDemo) {
    return {
      isDemo: true,
      orgShares: { some: { organizationId: { in: viewer.orgIds } } },
    };
  }
  // Admins ARE the operator: the whole non-demo fleet.
  if (viewer.isAdmin) return { isDemo: false };

  return {
    isDemo: false,
    OR: [
      { ownerUserId: userId },
      { orgShares: { some: { organizationId: { in: viewer.orgIds } } } },
    ],
  };
}

export async function canSeeProject(
  prisma: PrismaClient,
  userId: string | null,
  projectId: number,
): Promise<boolean> {
  const where = await visibleProjectFilter(prisma, userId);
  const hit = await prisma.project.findFirst({
    where: { AND: [{ id: projectId }, where] },
    select: { id: true },
  });
  return hit !== null;
}

/**
 * Phase 65.4 — seeing is not acting. Who may change a project's settings
 * (autonomyMode especially) or spend runs on it: the owner, an owner/admin
 * of an org it is shared into, a site admin, or the local operator. Plain
 * org members can see and discuss, not drive. Demo sessions never.
 * (A per-share permission column would refine "org admin" — phase 66.)
 */
async function actFilter(
  prisma: PrismaClient,
  userId: string | null,
): Promise<Prisma.ProjectWhereInput | null> {
  const viewer = await viewerContext(prisma, userId);
  if (viewer.kind === "none") return null;
  if (viewer.kind === "local") return { isDemo: false };
  if (!viewer.exists || viewer.isDemo) return null;
  if (viewer.isAdmin) return { isDemo: false };
  return {
    isDemo: false,
    OR: [
      { ownerUserId: userId },
      { orgShares: { some: { organizationId: { in: viewer.managedOrgIds } } } },
    ],
  };
}

async function matches(
  prisma: PrismaClient,
  where: Prisma.ProjectWhereInput | null,
  projectId: number,
): Promise<boolean> {
  if (!where) return false;
  const hit = await prisma.project.findFirst({
    where: { AND: [{ id: projectId }, where] },
    select: { id: true },
  });
  return hit !== null;
}

export async function canEditProject(
  prisma: PrismaClient,
  userId: string | null,
  projectId: number,
): Promise<boolean> {
  return matches(prisma, await actFilter(prisma, userId), projectId);
}

export async function canDispatchProject(
  prisma: PrismaClient,
  userId: string | null,
  projectId: number,
): Promise<boolean> {
  return matches(prisma, await actFilter(prisma, userId), projectId);
}
