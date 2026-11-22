/**
 * Batch review (HIGH) — the /observability pages read fleet-wide
 * telemetry; middleware only checks that a cookie EXISTS, so the pages
 * themselves must admit only the local operator or a non-demo admin.
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

import { isOperatorViewer } from "./operator-page";
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

describe("isOperatorViewer", () => {
  it("admits an admin; refuses users, demo visitors, forged and missing cookies", async () => {
    expect(
      await isOperatorViewer(new Headers({ cookie: cookie("admin") })),
    ).toBe(true);
    expect(
      await isOperatorViewer(new Headers({ cookie: cookie("alice") })),
    ).toBe(false);
    expect(
      await isOperatorViewer(new Headers({ cookie: cookie("demo1") })),
    ).toBe(false);
    expect(
      await isOperatorViewer(
        new Headers({ cookie: "better-auth.session_token=forged" }),
      ),
    ).toBe(false);
    expect(await isOperatorViewer(new Headers())).toBe(false);
  });

  it("the local operator is admitted in local mode", async () => {
    delete process.env.AUTH_REQUIRED;
    expect(await isOperatorViewer(new Headers())).toBe(true);
  });

  it("both observability pages are gated on it", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    for (const p of [
      "app/observability/tools/page.tsx",
      "app/observability/cache/page.tsx",
    ]) {
      const src = readFileSync(path.resolve(__dirname, "..", p), "utf8");
      expect(src, p).toMatch(/await requireOperatorPage\(\)/);
    }
  });
});
