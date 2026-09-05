/** 55.2 — project visibility ([54.D1]). */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { createOrg } from "./orgs";
import { visibleProjectFilter, canSeeProject } from "./project-access";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

async function fixture(r: DispatchRig) {
  const admin = await r.prisma.user.create({
    data: { id: "adm", name: "A", email: "a@x.dev", role: "admin" },
  });
  const alice = await r.prisma.user.create({
    data: { id: "alice", name: "Al", email: "al@x.dev" },
  });
  const bob = await r.prisma.user.create({
    data: { id: "bob", name: "B", email: "b@x.dev" },
  });
  const org = await createOrg(r.prisma, { name: "Org", ownerId: "alice" });
  // bob joins alice's org
  await r.prisma.member.create({
    data: { userId: "bob", organizationId: org.id, role: "member" },
  });

  const operator = await r.prisma.project.create({
    data: { name: "Operator", slug: "op-fleet", path: "/p/op" },
  });
  const owned = await r.prisma.project.create({
    data: {
      name: "Alice's",
      slug: "alices",
      path: "/p/al",
      ownerUserId: "alice",
    },
  });
  const shared = await r.prisma.project.create({
    data: {
      name: "Shared",
      slug: "shared",
      path: "/p/sh",
      ownerUserId: "alice",
    },
  });
  await r.prisma.orgProjectShare.create({
    data: { organizationId: org.id, projectId: shared.id, sharedById: "alice" },
  });
  const demo = await r.prisma.project.create({
    data: { name: "Demo", slug: "demo-x", path: "/p/d", isDemo: true },
  });
  return { admin, alice, bob, org, operator, owned, shared, demo };
}

async function visibleSlugs(
  r: DispatchRig,
  userId: string | null,
): Promise<string[]> {
  const where = await visibleProjectFilter(r.prisma, userId);
  const rows = await r.prisma.project.findMany({ where });
  return rows.map((p) => p.slug).sort();
}

describe("visibleProjectFilter", () => {
  it("local mode (no session user) sees everything except demo", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await fixture(rig);
    expect(await visibleSlugs(rig, null)).toEqual([
      "alices",
      "op-fleet",
      "shared",
    ]);
  });

  it("admins see the operator fleet plus all owned projects", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await fixture(rig);
    expect(await visibleSlugs(rig, "adm")).toEqual([
      "alices",
      "op-fleet",
      "shared",
    ]);
  });

  it("an owner sees their own projects; org members see shared ones", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await fixture(rig);
    expect(await visibleSlugs(rig, "alice")).toEqual(["alices", "shared"]);
    expect(await visibleSlugs(rig, "bob")).toEqual(["shared"]);
  });
});

describe("canSeeProject", () => {
  it("gates detail access the same way", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const f = await fixture(rig);
    expect(await canSeeProject(rig.prisma, "bob", f.shared.id)).toBe(true);
    expect(await canSeeProject(rig.prisma, "bob", f.owned.id)).toBe(false);
    expect(await canSeeProject(rig.prisma, "bob", f.operator.id)).toBe(false);
    expect(await canSeeProject(rig.prisma, "adm", f.operator.id)).toBe(true);
    expect(await canSeeProject(rig.prisma, null, f.operator.id)).toBe(true);
  });
});
