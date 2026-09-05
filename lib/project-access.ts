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
  if (!userId) return { kind: "local" as const };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isDemo: true },
  });
  const memberships = await prisma.member.findMany({
    where: { userId },
    select: { organizationId: true },
  });
  return {
    kind: "user" as const,
    isAdmin: user?.role === "admin",
    isDemo: user?.isDemo === true,
    orgIds: memberships.map((m) => m.organizationId),
  };
}

export async function visibleProjectFilter(
  prisma: PrismaClient,
  userId: string | null,
): Promise<Prisma.ProjectWhereInput> {
  const viewer = await viewerContext(prisma, userId);
  if (viewer.kind === "local") return { isDemo: false };
  if (viewer.isDemo) return { isDemo: true };
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
