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

  it("hosted: plain user sees none of the operator fleet, admin sees it, demo sees demo", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    await seed(rig);
    expect(await slugs(rig, "u-plain")).toEqual([]);
    expect(await slugs(rig, "u-admin")).toEqual(["fleet"]);
    expect(await slugs(rig, "u-demo")).toEqual(["demo-x"]);
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
