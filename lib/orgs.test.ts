/** 54.3 — session-aware org core. */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  createOrg,
  listUserOrgs,
  setActiveOrg,
  requireMembership,
} from "./orgs";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

async function makeUser(r: DispatchRig, id: string) {
  return r.prisma.user.create({
    data: { id, name: id, email: `${id}@x.dev` },
  });
}

describe("createOrg / listUserOrgs", () => {
  it("creates the org with the creator as owner member", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeUser(rig, "u1");
    const org = await createOrg(rig.prisma, {
      name: "Coqui Labs",
      ownerId: "u1",
    });
    const member = await rig.prisma.member.findFirst({
      where: { organizationId: org.id, userId: "u1" },
    });
    expect(member?.role).toBe("owner");
    expect(org.slug).toBe("coqui-labs");
  });

  it("lists only orgs I belong to, with my role", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeUser(rig, "u1");
    await makeUser(rig, "u2");
    const mine = await createOrg(rig.prisma, { name: "Mine", ownerId: "u1" });
    await createOrg(rig.prisma, { name: "Theirs", ownerId: "u2" });
    const orgs = await listUserOrgs(rig.prisma, "u1");
    expect(orgs).toHaveLength(1);
    expect(orgs[0].id).toBe(mine.id);
    expect(orgs[0].role).toBe("owner");
  });
});

describe("setActiveOrg", () => {
  it("stamps the session row for members and rejects non-members", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeUser(rig, "u1");
    await makeUser(rig, "u2");
    const org = await createOrg(rig.prisma, { name: "Mine", ownerId: "u1" });
    await rig.prisma.session.create({
      data: {
        id: "s1",
        token: "tok1",
        userId: "u1",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    await setActiveOrg(rig.prisma, {
      sessionToken: "tok1",
      userId: "u1",
      organizationId: org.id,
    });
    const session = await rig.prisma.session.findUnique({
      where: { token: "tok1" },
    });
    expect(session?.activeOrganizationId).toBe(org.id);

    await expect(
      setActiveOrg(rig.prisma, {
        sessionToken: "tok1",
        userId: "u2",
        organizationId: org.id,
      }),
    ).rejects.toThrow(/member/i);
  });
});

describe("requireMembership", () => {
  it("returns the member row for members, null otherwise", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeUser(rig, "u1");
    await makeUser(rig, "u2");
    const org = await createOrg(rig.prisma, { name: "Mine", ownerId: "u1" });
    expect(await requireMembership(rig.prisma, "u1", org.id)).not.toBeNull();
    expect(await requireMembership(rig.prisma, "u2", org.id)).toBeNull();
  });
});
