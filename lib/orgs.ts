/**
 * 54.3 — session-aware organization core, on the Better Auth org-plugin
 * tables (Organization / Member / Invitation). Users belong to any number
 * of orgs or none; the active org lives on the session row
 * (activeOrganizationId), same field Better Auth's plugin uses.
 */
import type { PrismaClient, Organization } from "@/app/generated/prisma/client";

export interface OrgWithRole extends Organization {
  role: string;
}

/** URL slug from an org name: accents folded, non-alphanumerics collapsed. */
export function slugifyOrgName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // í→i etc. — Coquí Labs → coqui-labs
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "org"
  );
}

export async function createOrg(
  prisma: PrismaClient,
  args: { name: string; ownerId: string },
): Promise<Organization> {
  await prisma.user.findUniqueOrThrow({ where: { id: args.ownerId } });
  // Unique-ify the slug: coqui-labs, coqui-labs-2, coqui-labs-3 …
  const base = slugifyOrgName(args.name);
  let slug = base;
  for (let n = 2; ; n++) {
    const clash = await prisma.organization.findUnique({ where: { slug } });
    if (!clash) break;
    slug = `${base}-${n}`;
  }
  const org = await prisma.organization.create({
    data: { name: args.name, slug },
  });
  await prisma.member.create({
    data: { organizationId: org.id, userId: args.ownerId, role: "owner" },
  });
  return org;
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
