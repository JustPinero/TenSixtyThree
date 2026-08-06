import { prisma } from "@/lib/db";
import { acceptInvite, inviteMember } from "@/lib/teams";
import type { Role } from "@/lib/teams";

/**
 * Phase 48.3 — invite lifecycle over HTTP.
 * POST → create an invite for the (single) team; returns the token to share.
 * PUT  → accept an invite: { token, name } resolves the invite's email into a
 *        User (created on first accept) and burns the token.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = body.email?.trim();
  if (!email)
    return Response.json({ error: "email required" }, { status: 400 });

  const team = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team)
    return Response.json({ error: "No team exists yet" }, { status: 400 });
  const ownerMembership = await prisma.member.findFirst({
    where: { organizationId: team.id, role: "owner" },
    include: { user: true },
  });
  if (!ownerMembership) {
    return Response.json({ error: "Team has no owner" }, { status: 500 });
  }
  try {
    const invite = await inviteMember(prisma, {
      team,
      email,
      role: (body.role as Role) ?? "member",
      invitedBy: ownerMembership.user,
    });
    return Response.json({
      invite: {
        token: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (e) {
    return Response.json(
      { error: String((e as Error).message) },
      { status: 400 },
    );
  }
}

export async function PUT(req: Request): Promise<Response> {
  let body: { token?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token)
    return Response.json({ error: "token required" }, { status: 400 });

  const invite = await prisma.invitation.findUnique({ where: { id: token } });
  if (!invite)
    return Response.json({ error: "Invalid invite token" }, { status: 400 });

  const user = await prisma.user.upsert({
    where: { email: invite.email },
    update: body.name ? { name: body.name } : {},
    create: { email: invite.email, name: body.name?.trim() || invite.email },
  });
  try {
    const membership = await acceptInvite(prisma, { token, user });
    return Response.json({ membership });
  } catch (e) {
    return Response.json(
      { error: String((e as Error).message) },
      { status: 400 },
    );
  }
}
