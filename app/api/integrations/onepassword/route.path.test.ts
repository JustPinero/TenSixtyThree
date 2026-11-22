/**
 * Phase 70 — 1Password populate writes .env.local into a directory; that
 * directory must be a registered (non-demo) project, not any path the
 * request names.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const populateEnvLocal = vi.fn(async () => ({ written: 1 }));
vi.mock("@/lib/onepassword", () => ({
  isOpAuthenticated: () => true,
  readExpectedVars: async () => ["A"],
  checkVaultItem: () => [],
  createVaultItem: () => ({ ok: true }),
  populateEnvLocal: (...args: unknown[]) => populateEnvLocal(...(args as [])),
}));

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

import { POST } from "./route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;

beforeEach(async () => {
  delete process.env.AUTH_REQUIRED;
  rig = await createDispatchRig({ fakeTimers: false });
  (globalThis as Record<string, unknown>).__rigPrisma = rig.prisma;
  populateEnvLocal.mockClear();
});

afterEach(async () => {
  delete (globalThis as Record<string, unknown>).__rigPrisma;
  await rig?.dispose();
  rig = null;
});

function populate(projectPath: string) {
  return POST(
    new NextRequest("http://127.0.0.1:3000/api/integrations/onepassword", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "populate",
        projectPath,
        projectName: "x",
      }),
    }),
  );
}

describe("POST /api/integrations/onepassword populate", () => {
  it("refuses a path that is not a registered project", async () => {
    const res = await populate("/Users/someone/.ssh");
    expect(res.status).toBe(403);
    expect(populateEnvLocal).not.toHaveBeenCalled();
  });

  it("refuses a demo project's path", async () => {
    await rig!.prisma.project.create({
      data: { name: "d", slug: "d", path: "/demo/d", isDemo: true },
    });
    expect((await populate("/demo/d")).status).toBe(403);
  });

  it("writes into a registered project", async () => {
    await rig!.prisma.project.create({
      data: { name: "p", slug: "p", path: "/p/real" },
    });
    const res = await populate("/p/real");
    expect(res.status).toBe(200);
    expect(populateEnvLocal).toHaveBeenCalledTimes(1);
  });
});
