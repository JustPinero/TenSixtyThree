/** 55.1 — org-invitation auto-accept (closes the 54.1 gap). */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { createOrg } from "./orgs";
import { acceptPendingInvitations } from "./invite-accept";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

const FRESH = new Date(Date.now() + 24 * 3600_000);
const STALE = new Date(Date.now() - 3600_000);

async function setup(r: DispatchRig) {
  const owner = await r.prisma.user.create({
    data: { id: "owner", name: "Owner", email: "owner@x.dev" },
  });
  const invitee = await r.prisma.user.create({
    data: { id: "inv", name: "Invitee", email: "invitee@x.dev" },
  });
  const org = await createOrg(r.prisma, { name: "Org", ownerId: owner.id });
  return { owner, invitee, org };
}

describe("acceptPendingInvitations", () => {
  it("turns a pending fresh invitation into membership with its role", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { owner, invitee, org } = await setup(rig);
    await rig.prisma.invitation.create({
      data: {
        organizationId: org.id,
        email: "Invitee@X.dev", // case differs on purpose
        role: "member",
        expiresAt: FRESH,
        inviterId: owner.id,
      },
    });

    const accepted = await acceptPendingInvitations(
      rig.prisma,
      invitee.id,
      invitee.email,
    );
    expect(accepted).toBe(1);

    const member = await rig.prisma.member.findFirst({
      where: { userId: invitee.id, organizationId: org.id },
    });
    expect(member?.role).toBe("member");
    const invitation = await rig.prisma.invitation.findFirst({
      where: { organizationId: org.id },
    });
    expect(invitation?.status).toBe("accepted");
  });

  it("is idempotent and ignores expired/canceled invitations", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { owner, invitee, org } = await setup(rig);
    await rig.prisma.invitation.createMany({
      data: [
        {
          organizationId: org.id,
          email: invitee.email,
          role: "member",
          status: "canceled",
          expiresAt: FRESH,
          inviterId: owner.id,
        },
        {
          organizationId: org.id,
          email: invitee.email,
          role: "member",
          status: "pending",
          expiresAt: STALE,
          inviterId: owner.id,
        },
      ],
    });
    expect(
      await acceptPendingInvitations(rig.prisma, invitee.id, invitee.email),
    ).toBe(0);

    // Fresh one: accept once, second call is a no-op (already a member).
    await rig.prisma.invitation.create({
      data: {
        organizationId: org.id,
        email: invitee.email,
        role: "admin",
        expiresAt: FRESH,
        inviterId: owner.id,
      },
    });
    expect(
      await acceptPendingInvitations(rig.prisma, invitee.id, invitee.email),
    ).toBe(1);
    expect(
      await acceptPendingInvitations(rig.prisma, invitee.id, invitee.email),
    ).toBe(0);
    const members = await rig.prisma.member.count({
      where: { userId: invitee.id, organizationId: org.id },
    });
    expect(members).toBe(1);
  });
});
