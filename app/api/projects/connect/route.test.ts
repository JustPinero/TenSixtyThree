/**
 * Phase 68.2 — a hosted user can own a project: connect a GitHub repo,
 * get an owned Project they (and only they) can see.
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

import { POST } from "./route";
import { GET as listProjects } from "../route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  seedTenants,
  requestAs,
  type TenantUser,
} from "@/tests/harness/tenants";

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

const connect = (u: TenantUser | null, body: Record<string, unknown>) =>
  POST(requestAs(u, "http://x/api/projects/connect", { method: "POST", body }));

async function slugsFor(u: TenantUser): Promise<string[]> {
  const res = await listProjects(requestAs(u, "http://x/api/projects"));
  const body = (await res.json()) as
    { slug: string }[] | { projects: { slug: string }[] };
  const rows = Array.isArray(body) ? body : body.projects;
  return rows.map((p) => p.slug);
}

describe("POST /api/projects/connect", () => {
  it("creates an owned project from a repo URL, visible to its owner only", async () => {
    const res = await connect("carol", {
      githubRepo: "https://github.com/carol/Weather-App.git",
    });
    expect(res.status).toBe(201);
    const { project } = (await res.json()) as {
      project: { slug: string; githubRepo: string; ownerUserId: string };
    };
    expect(project).toMatchObject({
      slug: "weather-app",
      githubRepo: "carol/Weather-App",
      ownerUserId: "carol",
    });
    expect(await slugsFor("carol")).toContain("weather-app");
    expect(await slugsFor("bob")).not.toContain("weather-app");
  });

  it("a slug clash gets a suffix; connecting the same repo twice is a 409", async () => {
    await rig!.prisma.project.create({
      data: { name: "x", slug: "weather-app", path: "/p/x" },
    });
    const first = await connect("carol", { githubRepo: "carol/weather-app" });
    expect(
      ((await first.json()) as { project: { slug: string } }).project.slug,
    ).toBe("weather-app-2");
    const again = await connect("carol", {
      githubRepo: "https://github.com/carol/weather-app",
    });
    expect(again.status).toBe(409);
  });

  it("rejects something that is not a GitHub repo", async () => {
    expect((await connect("carol", { githubRepo: "not a repo" })).status).toBe(
      400,
    );
  });

  it("demo visitors and anonymous callers cannot connect", async () => {
    expect((await connect("demo1", { githubRepo: "x/y" })).status).toBe(403);
    expect((await connect(null, { githubRepo: "x/y" })).status).toBe(401);
  });
});
