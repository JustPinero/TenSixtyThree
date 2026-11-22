/**
 * Phase 66.4 — org permission matrix for share / unshare / Linear key,
 * and one membership per (user, org).
 */
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

import * as shares from "./projects/route";
import * as linear from "./linear/route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  seedTenants,
  requestAs,
  type Tenants,
  type TenantUser,
} from "@/tests/harness/tenants";
import { createOrg } from "@/lib/orgs";

let rig: DispatchRig | null = null;
let t: Tenants;

beforeEach(async () => {
  process.env.AUTH_REQUIRED = "true";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  rig = await createDispatchRig({ fakeTimers: false });
  (globalThis as Record<string, unknown>).__rigPrisma = rig.prisma;
  t = await seedTenants(rig.prisma);
  await setActiveOrg(["alice", "bob"], t.orgs.aliceOrg.id);
});

afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  delete (globalThis as Record<string, unknown>).__rigPrisma;
  await rig?.dispose();
  rig = null;
});

async function setActiveOrg(users: TenantUser[], orgId: string) {
  await rig!.prisma.session.updateMany({
    where: { userId: { in: users } },
    data: { activeOrganizationId: orgId },
  });
}

async function makeBobOrgAdmin() {
  await rig!.prisma.member.updateMany({
    where: { userId: "bob", organizationId: t.orgs.aliceOrg.id },
    data: { role: "admin" },
  });
}

const share = (u: TenantUser, projectId: number) =>
  shares.POST(
    requestAs(u, "http://x/api/orgs/projects", {
      method: "POST",
      body: { projectId },
    }),
  );
const unshare = (u: TenantUser, projectId: number) =>
  shares.DELETE(
    requestAs(u, "http://x/api/orgs/projects", {
      method: "DELETE",
      body: { projectId },
    }),
  );
const putKey = (u: TenantUser) =>
  linear.PUT(
    requestAs(u, "http://x/api/orgs/linear", {
      method: "PUT",
      body: { key: "lin_api_0123456789abcdef0123" },
    }),
  );

describe("share", () => {
  it("the project's owner can share it into their org", async () => {
    expect((await share("alice", t.projects.alices.id)).status).toBe(200);
  });

  it("an org admin cannot carry a shared project into an org of their own", async () => {
    await makeBobOrgAdmin();
    const bobOrg = await createOrg(rig!.prisma, {
      name: "Bob Org",
      ownerId: "bob",
    });
    await setActiveOrg(["bob"], bobOrg.id);
    expect((await share("bob", t.projects.shared.id)).status).toBe(403);
  });

  it("a member cannot share a project they cannot see", async () => {
    expect((await share("bob", t.projects.alices.id)).status).toBe(404);
  });
});

describe("unshare", () => {
  it("a plain member cannot unshare", async () => {
    expect((await unshare("bob", t.projects.shared.id)).status).toBe(403);
  });

  it("an org admin can unshare from their org", async () => {
    await makeBobOrgAdmin();
    expect((await unshare("bob", t.projects.shared.id)).status).toBe(200);
  });

  it("the project's owner can unshare", async () => {
    expect((await unshare("alice", t.projects.shared.id)).status).toBe(200);
  });
});

describe("Linear key", () => {
  it("a plain member cannot set the org's Linear key", async () => {
    expect((await putKey("bob")).status).toBe(403);
    const org = await rig!.prisma.organization.findUniqueOrThrow({
      where: { id: t.orgs.aliceOrg.id },
    });
    expect(org.linearKeyEnc).toBeNull();
  });

  it("the org owner (and an org admin) can", async () => {
    expect((await putKey("alice")).status).toBe(200);
    await makeBobOrgAdmin();
    expect((await putKey("bob")).status).toBe(200);
  });
});

describe("membership", () => {
  it("one Member row per (user, org)", async () => {
    await expect(
      rig!.prisma.member.create({
        data: {
          userId: "bob",
          organizationId: t.orgs.aliceOrg.id,
          role: "member",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("70 — Linear import target", () => {
  it("the org's key cannot import into a board outside the active org", async () => {
    const { createBoard } = await import("@/lib/boards");
    await linear.PUT(
      requestAs("alice", "http://x/api/orgs/linear", {
        method: "PUT",
        body: { key: "lin_api_0123456789abcdef0123" },
      }),
    );
    const personal = await createBoard(rig!.prisma, { name: "Mine", ownerUserId: "alice" });
    const res = await linear.POST(
      requestAs("alice", "http://x/api/orgs/linear", {
        method: "POST",
        body: { boardId: personal.id },
      }),
    );
    expect(res.status).toBe(404);
  });
});
