/**
 * Phase 51.3 — teams domain service, now backed by Better Auth's organization
 * plugin tables (Organization / Member / Invitation). The seam is preserved
 * from Phase 43 (createTeam, inviteMember, acceptInvite, ...) so callers and
 * the collision-plane feed don't care that the security-critical internals
 * (invitation lifecycle, tokens, expiry) are plugin-owned now.
 *
 * The Better Auth runtime (lib/auth.ts) operates on these same tables for
 * session-scoped flows (activeOrganizationId, client-side invitation accept);
 * this service is the prisma-injected server/test path.
 */
import type {
  PrismaClient,
  Organization,
  Member,
  Invitation,
  User,
} from "@/app/generated/prisma/client";

export type Role = "owner" | "admin" | "member" | "viewer";
export type Team = Organization; // seam alias — callers keep saying "team"

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // í→i etc. — Coquí Labs → coqui-labs
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "team"
  );
}

export async function createTeam(
  prisma: PrismaClient,
  args: { name: string; owner: User }
): Promise<Organization> {
  const base = slugify(args.name);
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
    data: { organizationId: org.id, userId: args.owner.id, role: "owner" },
  });
  return org;
}

export async function inviteMember(
  prisma: PrismaClient,
  args: {
    team: Organization;
    email: string;
    role?: Role;
    invitedBy: User;
    now?: Date;
    ttlMs?: number;
  }
): Promise<Invitation> {
  const now = args.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (args.ttlMs ?? INVITE_TTL_MS));
  const existing = await prisma.invitation.findFirst({
    where: {
      organizationId: args.team.id,
      email: args.email,
      status: "pending",
    },
  });
  if (existing) {
    // Re-invite ROTATES the invitation (delete + recreate): the id doubles as
    // the shareable token, so a re-invite must invalidate the old link.
    await prisma.invitation.delete({ where: { id: existing.id } });
  }
  return prisma.invitation.create({
    data: {
      organizationId: args.team.id,
      email: args.email,
      role: args.role ?? "member",
      status: "pending",
      expiresAt,
      inviterId: args.invitedBy.id,
    },
  });
}

export async function acceptInvite(
  prisma: PrismaClient,
  args: { token: string; user: User; now?: Date }
): Promise<Member> {
  const now = args.now ?? new Date();
  // Seam note: the "token" the caller shares is the Invitation id (plugin
  // convention — acceptance is by invitation id, not a bespoke secret).
  const invite = await prisma.invitation.findUnique({
    where: { id: args.token },
  });
  if (!invite) throw new Error("Invalid invite token");
  if (invite.status === "accepted") throw new Error("Invite already accepted");
  if (invite.status === "canceled" || invite.status === "revoked")
    throw new Error("Invite was revoked");
  if (invite.expiresAt.getTime() <= now.getTime())
    throw new Error("Invite expired");

  return prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    });
    return tx.member.upsert({
      where: {
        // no compound unique on (orgId,userId) in plugin schema — emulate
        id:
          (
            await tx.member.findFirst({
              where: {
                organizationId: invite.organizationId,
                userId: args.user.id,
              },
            })
          )?.id ?? "___create___",
      },
      update: { role: invite.role ?? "member" },
      create: {
        organizationId: invite.organizationId,
        userId: args.user.id,
        role: invite.role ?? "member",
      },
    });
  });
}

export async function addMember(
  prisma: PrismaClient,
  args: { team: Organization; user: User; role?: Role }
): Promise<Member> {
  const existing = await prisma.member.findFirst({
    where: { organizationId: args.team.id, userId: args.user.id },
  });
  if (existing) {
    return prisma.member.update({
      where: { id: existing.id },
      data: { role: args.role ?? existing.role },
    });
  }
  return prisma.member.create({
    data: {
      organizationId: args.team.id,
      userId: args.user.id,
      role: args.role ?? "member",
    },
  });
}

export async function roleOf(
  prisma: PrismaClient,
  user: User,
  team: Organization
): Promise<Role | null> {
  const m = await prisma.member.findFirst({
    where: { organizationId: team.id, userId: user.id },
  });
  return (m?.role as Role) ?? null;
}

export async function isMember(
  prisma: PrismaClient,
  user: User,
  team: Organization
): Promise<boolean> {
  return (await roleOf(prisma, user, team)) !== null;
}

export async function listMembers(prisma: PrismaClient, team: Organization) {
  return prisma.member.findMany({
    where: { organizationId: team.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function listTeams(
  prisma: PrismaClient,
  user: User
): Promise<Organization[]> {
  const memberships = await prisma.member.findMany({
    where: { userId: user.id },
    include: { organization: true },
  });
  return memberships.map((m) => m.organization);
}
