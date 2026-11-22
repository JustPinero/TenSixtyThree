/** Phase 60.2 — the server-side first load follows the visibility matrix. */
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

import { loadInitialProjects } from "./dashboard-data";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { seedTenants, cookie } from "@/tests/harness/tenants";

let rig: DispatchRig | null = null;

beforeEach(async () => {
  process.env.AUTH_REQUIRED = "true";
  rig = await createDispatchRig({ fakeTimers: false });
  (globalThis as Record<string, unknown>).__rigPrisma = rig.prisma;
  await seedTenants(rig.prisma);
});

afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  delete (globalThis as Record<string, unknown>).__rigPrisma;
  await rig?.dispose();
  rig = null;
});

describe("loadInitialProjects", () => {
  it("returns the viewer's visible projects as dashboard tiles", async () => {
    const tiles = await loadInitialProjects(
      new Headers({ cookie: cookie("alice") }),
    );
    expect(tiles?.map((t) => t.slug).sort()).toEqual(["alices", "shared"]);
    expect(typeof tiles?.[0].lastActivityAt).toBe("string");
  });

  it("no session on the hosted app → null (nothing rendered server-side)", async () => {
    expect(await loadInitialProjects(new Headers())).toBeNull();
  });
});
