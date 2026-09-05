/**
 * 55.1 — org-invitation auto-accept.
 *
 * Closes the 54.1 loop: the invite gate lets an org-invited email CREATE
 * an account, but the Better Auth org plugin only accepts invitations via
 * an explicit logged-in call. This runs on the first authenticated touch
 * (/api/orgs GET): every pending, unexpired invitation matching the
 * user's email becomes a Member row with the invitation's role.
 */
import type { PrismaClient } from "@/app/generated/prisma/client";

export async function acceptPendingInvitations(
  prisma: PrismaClient,
  userId: string,
  email: string,
): Promise<number> {
  // Security review 55: match on the account's CANONICAL email and only
  // when verified — an unverified (or caller-supplied) address must not
  // harvest someone else's invitations. OTP/OAuth sign-ins verify by
  // construction; anything else waits.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true },
  });
  if (!user?.emailVerified) return 0;
  void email; // kept for call-site compatibility; canonical wins

  const pending = await prisma.invitation.findMany({
    where: {
      email: { equals: user.email.trim().toLowerCase(), mode: "insensitive" },
      status: "pending",
      expiresAt: { gt: new Date() },
    },
  });

  let accepted = 0;
  for (const invitation of pending) {
    const already = await prisma.member.findFirst({
      where: { userId, organizationId: invitation.organizationId },
    });
    if (!already) {
      await prisma.member.create({
        data: {
          userId,
          organizationId: invitation.organizationId,
          role: invitation.role ?? "member",
        },
      });
      accepted++;
    }
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted" },
    });
  }
  return accepted;
}
