/** Phase 68.4 — members + pending invites: list, role change, remove, revoke. */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => {
  const proxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      const inj = (globalThis as Record<string, unknown>).__rigPrisma;
      if (!inj) throw new Error("rig prisma not injected");
      return (inj as Record<string, unknown>)[prop as string];
    },
  });
  return { prisma: proxy };
});

import * as members from "./route";
import { DELETE as revokeInvite } from "../invite/route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  seedTenants,
  requestAs,
  type Tenants,
  type TenantUser,
} from "@/tests/harness/tenants";

let rig: DispatchRig | null = null;
let t: Tenants;

beforeEach(async () => {
  process.env.AUTH_REQUIRED = "true";
  rig = await createDispatchRig({ fakeTimers: false });
  (globalThis as Record<string, unknown>).__rigPrisma = rig.prisma;
  t = await seedTenants(rig.prisma);
  await rig.prisma.session.updateMany({
    where: { userId: { in: ["alice", "bob", "carol"] } },
    data: { activeOrganizationId: t.orgs.aliceOrg.id },
  });
  await rig.prisma.invitation.create({
    data: {
      id: "inv-1",
      organizationId: t.orgs.aliceOrg.id,
      email: "new@x.dev",
      role: "member",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: "alice",
    },
  });
});

afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  delete (globalThis as Record<string, unknown>).__rigPrisma;
  await rig?.dispose();
  rig = null;
});

async function memberId(userId: string) {
  const m = await rig!.prisma.member.findFirstOrThrow({
    where: { userId, organizationId: t.orgs.aliceOrg.id },
  });
  return m.id;
}

const patch = (u: TenantUser, body: unknown) =>
  members.PATCH(
    requestAs(u, "http://x/api/orgs/members", { method: "PATCH", body }),
  );
const remove = (u: TenantUser, body: unknown) =>
  members.DELETE(
    requestAs(u, "http://x/api/orgs/members", { method: "DELETE", body }),
  );

describe("GET /api/orgs/members", () => {
  it("any member sees members and pending invites", async () => {
    const res = await members.GET(
      requestAs("bob", "http://x/api/orgs/members"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      members: { email: string; role: string }[];
      invitations: { email: string }[];
      canManage: boolean;
    };
    expect(body.members.map((m) => [m.email, m.role]).sort()).toEqual([
      ["alice@tenants.test", "owner"],
      ["bob@tenants.test", "member"],
    ]);
    expect(body.invitations.map((i) => i.email)).toEqual(["new@x.dev"]);
    expect(body.canManage).toBe(false);
  });

  it("a non-member is refused", async () => {
    expect(
      (await members.GET(requestAs("carol", "http://x/api/orgs/members")))
        .status,
    ).toBe(403);
  });
});

describe("role change and removal", () => {
  it("the owner can promote a member; a plain member cannot", async () => {
    const bob = await memberId("bob");
    expect((await patch("bob", { memberId: bob, role: "admin" })).status).toBe(
      403,
    );
    expect(
      (await patch("alice", { memberId: bob, role: "admin" })).status,
    ).toBe(200);
    expect(
      (await rig!.prisma.member.findUniqueOrThrow({ where: { id: bob } })).role,
    ).toBe("admin");
  });

  it("the last owner can't be demoted or removed", async () => {
    const alice = await memberId("alice");
    expect(
      (await patch("alice", { memberId: alice, role: "member" })).status,
    ).toBe(409);
    expect((await remove("alice", { memberId: alice })).status).toBe(409);
  });

  it("an admin cannot change or remove an owner", async () => {
    await rig!.prisma.member.update({
      where: { id: await memberId("bob") },
      data: { role: "admin" },
    });
    const alice = await memberId("alice");
    expect(
      (await patch("bob", { memberId: alice, role: "member" })).status,
    ).toBe(403);
    expect((await remove("bob", { memberId: alice })).status).toBe(403);
  });

  it("the owner can remove a member", async () => {
    const bob = await memberId("bob");
    expect((await remove("alice", { memberId: bob })).status).toBe(200);
    expect(
      await rig!.prisma.member.findUnique({ where: { id: bob } }),
    ).toBeNull();
  });

  it("a member id from another org is a 404", async () => {
    const demoMember = await rig!.prisma.member.findFirstOrThrow({
      where: { userId: "demo1" },
    });
    expect(
      (await patch("alice", { memberId: demoMember.id, role: "admin" })).status,
    ).toBe(404);
  });
});

describe("DELETE /api/orgs/invite (revoke)", () => {
  const revoke = (u: TenantUser) =>
    revokeInvite(
      requestAs(u, "http://x/api/orgs/invite", {
        method: "DELETE",
        body: { invitationId: "inv-1" },
      }),
    );

  it("a plain member cannot revoke; the owner can", async () => {
    expect((await revoke("bob")).status).toBe(403);
    expect((await revoke("alice")).status).toBe(200);
    expect(
      (
        await rig!.prisma.invitation.findUniqueOrThrow({
          where: { id: "inv-1" },
        })
      ).status,
    ).toBe("canceled");
  });
});

describe("batch review — last-owner guard under concurrency", () => {
  it("two owners demoting each other at once leave at least one owner", async () => {
    const bob = await memberId("bob");
    await rig!.prisma.member.update({ where: { id: bob }, data: { role: "owner" } });
    const alice = await memberId("alice");
    await Promise.all([
      patch("alice", { memberId: bob, role: "member" }),
      patch("bob", { memberId: alice, role: "member" }),
    ]);
    const owners = await rig!.prisma.member.count({
      where: { organizationId: t.orgs.aliceOrg.id, role: "owner" },
    });
    expect(owners).toBeGreaterThanOrEqual(1);
  });
});

