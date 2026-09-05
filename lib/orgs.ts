/**
 * 54.3 — session-aware organization core, on the Better Auth org-plugin
 * tables (Organization / Member / Invitation). Users belong to any number
 * of orgs or none; the active org lives on the session row
 * (activeOrganizationId), same field Better Auth's plugin uses.
 */
import type { PrismaClient, Organization } from "@/app/generated/prisma/client";
import { createTeam } from "./teams";

export interface OrgWithRole extends Organization {
  role: string;
}

export async function createOrg(
  prisma: PrismaClient,
  args: { name: string; ownerId: string },
): Promise<Organization> {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: args.ownerId },
  });
  // createTeam (51.3) already slugifies + uniquifies + writes the owner
  // Member row; the single-team restriction was route policy, not lib.
  return createTeam(prisma, { name: args.name, owner });
}

export async function listUserOrgs(
  prisma: PrismaClient,
  userId: string,
): Promise<OrgWithRole[]> {
  const members = await prisma.member.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ ...m.organization, role: m.role }));
}

export async function requireMembership(
  prisma: PrismaClient,
  userId: string,
  organizationId: string,
) {
  return prisma.member.findFirst({
    where: { userId, organizationId },
  });
}

export async function setActiveOrg(
  prisma: PrismaClient,
  args: { sessionToken: string; userId: string; organizationId: string },
): Promise<void> {
  const member = await requireMembership(
    prisma,
    args.userId,
    args.organizationId,
  );
  if (!member) {
    throw new Error("Not a member of that organization");
  }
  await prisma.session.update({
    where: { token: args.sessionToken },
    data: { activeOrganizationId: args.organizationId },
  });
}
