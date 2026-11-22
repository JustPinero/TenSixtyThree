/** Phase 58.1 — real route tests for /api/templates and /api/knowledge (replacing tautological ones). */
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

import * as templates from "./route";
import { GET as knowledgeGET } from "../knowledge/route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { seedTenants, requestAs } from "@/tests/harness/tenants";

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

describe("/api/templates", () => {
  it("an admin creates a template; any signed-in user lists it", async () => {
    const created = await templates.POST(
      requestAs("admin", "http://x/api/templates", {
        method: "POST",
        body: {
          name: "Web app",
          description: "d",
          content: "# Kickoff",
          projectType: "web-app",
        },
      }),
    );
    expect(created.status).toBeLessThan(300);
    const res = await templates.GET(
      requestAs("carol", "http://x/api/templates"),
    );
    expect(res.status).toBe(200);
    const list = (await res.json()) as { name: string }[];
    expect(list.map((t) => t.name)).toContain("Web app");
  });

  it("a non-admin cannot create one; missing fields are a 400", async () => {
    const res = await templates.POST(
      requestAs("carol", "http://x/api/templates", {
        method: "POST",
        body: { name: "x", content: "y" },
      }),
    );
    expect(res.status).toBe(403);
    const bad = await templates.POST(
      requestAs("admin", "http://x/api/templates", {
        method: "POST",
        body: { name: "" },
      }),
    );
    expect(bad.status).toBe(400);
  });
});

describe("/api/knowledge", () => {
  it("admins list lessons; plain users are refused", async () => {
    await rig!.prisma.knowledgeLesson.create({
      data: { title: "Pin Node", content: "x", category: "tooling" },
    });
    const ok = await knowledgeGET(requestAs("admin", "http://x/api/knowledge"));
    expect(ok.status).toBe(200);
    expect(JSON.stringify(await ok.json())).toContain("Pin Node");
    expect(
      (await knowledgeGET(requestAs("carol", "http://x/api/knowledge"))).status,
    ).toBe(403);
  });
});
