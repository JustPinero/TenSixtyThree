/** 53.4 — Project.themeKey (per-project persona) PATCH surface. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
});

async function loadRoute(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return await import("./route");
}

async function makeProject(r: DispatchRig) {
  return r.prisma.project.create({
    data: { name: "Rig", slug: "rig", path: "/p/rig" },
  });
}

function patchReq(body: unknown) {
  return new Request("http://x/api/projects/rig", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ slug: "rig" }) };

describe("PATCH /api/projects/[slug] themeKey", () => {
  it("persists a valid registry key", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeProject(rig);
    const route = await loadRoute(rig);
    const res = await route.PATCH(patchReq({ themeKey: "sage" }), params);
    expect(res.status).toBe(200);
    const row = await rig.prisma.project.findUnique({
      where: { slug: "rig" },
    });
    expect(row?.themeKey).toBe("sage");
  });

  it("rejects a non-registry key (400 when it's the only field)", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeProject(rig);
    const route = await loadRoute(rig);
    const res = await route.PATCH(patchReq({ themeKey: "vaporwave" }), params);
    expect(res.status).toBe(400);
    const row = await rig.prisma.project.findUnique({
      where: { slug: "rig" },
    });
    expect(row?.themeKey).toBeNull();
  });

  it("explicit null clears the override", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeProject(rig);
    await rig.prisma.project.update({
      where: { slug: "rig" },
      data: { themeKey: "pixel" },
    });
    const route = await loadRoute(rig);
    const res = await route.PATCH(patchReq({ themeKey: null }), params);
    expect(res.status).toBe(200);
    const row = await rig.prisma.project.findUnique({
      where: { slug: "rig" },
    });
    expect(row?.themeKey).toBeNull();
  });
});
