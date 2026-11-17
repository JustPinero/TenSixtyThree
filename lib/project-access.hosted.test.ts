/** Phase 64.2 (hosted matrix) — "local" comes from configuration, never a missing session. */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { visibleProjectFilter } from "./project-access";
import { resolveAnthropicKey } from "./anthropic-key";

let rig: DispatchRig | null = null;
const ORIGINAL = process.env.AUTH_REQUIRED;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  if (ORIGINAL === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = ORIGINAL;
});

async function seed(r: DispatchRig) {
  await r.prisma.project.create({
    data: { name: "Fleet", slug: "fleet", path: "/p/fleet" },
  });
  await r.prisma.project.create({
    data: { name: "Demo", slug: "demo-x", path: "/p/demo-x", isDemo: true },
  });
  for (const [id, role, isDemo] of [
    ["u-plain", "user", false],
    ["u-admin", "admin", false],
    ["u-demo", "user", true],
  ] as const) {
    await r.prisma.user.create({
      data: { id, name: id, email: `${id}@x.dev`, role, isDemo },
    });
  }
}

async function slugs(r: DispatchRig, userId: string | null) {
  const where = await visibleProjectFilter(r.prisma, userId);
  const rows = await r.prisma.project.findMany({
    where,
    select: { slug: true },
  });
  return rows.map((p) => p.slug).sort();
}

describe("visibleProjectFilter × AUTH_REQUIRED", () => {
  it("local mode, null user → whole non-demo fleet", async () => {
    delete process.env.AUTH_REQUIRED;
    rig = await createDispatchRig({ fakeTimers: false });
    await seed(rig);
    expect(await slugs(rig, null)).toEqual(["fleet"]);
  });

  it("hosted, null user → nothing", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    await seed(rig);
    expect(await slugs(rig, null)).toEqual([]);
  });

  it("hosted: plain user sees none of the operator fleet, admin sees it, a demo user without a sandbox org sees nothing", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    await seed(rig);
    expect(await slugs(rig, "u-plain")).toEqual([]);
    expect(await slugs(rig, "u-admin")).toEqual(["fleet"]);
    expect(await slugs(rig, "u-demo")).toEqual([]);
  });

  it("hosted: an unknown user id → nothing", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    await seed(rig);
    expect(await slugs(rig, "u-ghost")).toEqual([]);
  });
});

describe("resolveAnthropicKey × AUTH_REQUIRED", () => {
  it("hosted, null user → no key at all", async () => {
    process.env.AUTH_REQUIRED = "true";
    process.env.ANTHROPIC_API_KEY = "sk-app";
    rig = await createDispatchRig({ fakeTimers: false });
    const k = await resolveAnthropicKey(rig.prisma, null);
    expect(k.key).toBe("");
    expect(k.source).toBe("none");
  });

  it("local, null user → app key", async () => {
    delete process.env.AUTH_REQUIRED;
    process.env.ANTHROPIC_API_KEY = "sk-app";
    rig = await createDispatchRig({ fakeTimers: false });
    const k = await resolveAnthropicKey(rig.prisma, null);
    expect(k).toEqual({ key: "sk-app", source: "app" });
  });
});

describe("demo visitors see only their own sandbox (S13)", () => {
  it("two demo users never see each other's demo projects", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    for (const n of ["a", "b"]) {
      await r.prisma.user.create({
        data: { id: `demo-${n}`, name: n, email: `${n}@demo.x`, isDemo: true },
      });
      await r.prisma.organization.create({
        data: { id: `org-${n}`, name: n, slug: `org-${n}`, isDemo: true, createdAt: new Date() },
      });
      await r.prisma.member.create({
        data: { userId: `demo-${n}`, organizationId: `org-${n}`, role: "owner", createdAt: new Date() },
      });
      const p = await r.prisma.project.create({
        data: { name: n, slug: `demo-${n}-proj`, path: `/demo/${n}`, isDemo: true },
      });
      await r.prisma.orgProjectShare.create({
        data: { organizationId: `org-${n}`, projectId: p.id, sharedById: `demo-${n}` },
      });
    }
    expect(await slugs(r, "demo-a")).toEqual(["demo-a-proj"]);
    expect(await slugs(r, "demo-b")).toEqual(["demo-b-proj"]);
  });
});

describe("canEditProject / canDispatchProject (65.4)", () => {
  async function matrix(r: DispatchRig) {
    for (const [id, role] of [
      ["owner", "user"],
      ["orgadmin", "user"],
      ["orgmember", "user"],
      ["stranger", "user"],
      ["admin", "admin"],
    ] as const) {
      await r.prisma.user.create({ data: { id, name: id, email: `${id}@x.dev`, role } });
    }
    await r.prisma.user.create({
      data: { id: "demo", name: "d", email: "d@demo.x", isDemo: true },
    });
    await r.prisma.organization.create({
      data: { id: "org", name: "Org", slug: "org", createdAt: new Date() },
    });
    for (const [userId, role] of [
      ["owner", "owner"],
      ["orgadmin", "admin"],
      ["orgmember", "member"],
    ] as const) {
      await r.prisma.member.create({
        data: { userId, organizationId: "org", role, createdAt: new Date() },
      });
    }
    const p = await r.prisma.project.create({
      data: { name: "Owned", slug: "owned", path: "/p/o", ownerUserId: "owner" },
    });
    await r.prisma.orgProjectShare.create({
      data: { organizationId: "org", projectId: p.id, sharedById: "owner" },
    });
    return p.id;
  }

  it("owner, org owner/admin and site admin may edit and dispatch; plain members, strangers and demo may not", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const id = await matrix(rig);
    const { canEditProject, canDispatchProject } = await import("./project-access");
    const expected: Record<string, boolean> = {
      owner: true,
      orgadmin: true,
      orgmember: false,
      stranger: false,
      admin: true,
      demo: false,
    };
    for (const [user, allowed] of Object.entries(expected)) {
      expect(await canEditProject(rig.prisma, user, id), `edit ${user}`).toBe(allowed);
      expect(await canDispatchProject(rig.prisma, user, id), `dispatch ${user}`).toBe(allowed);
    }
    expect(await canEditProject(rig.prisma, null, id)).toBe(false);
  });

  it("local mode: the operator may edit and dispatch", async () => {
    delete process.env.AUTH_REQUIRED;
    rig = await createDispatchRig({ fakeTimers: false });
    const id = await matrix(rig);
    const { canEditProject, canDispatchProject } = await import("./project-access");
    expect(await canEditProject(rig.prisma, null, id)).toBe(true);
    expect(await canDispatchProject(rig.prisma, null, id)).toBe(true);
  });
});
