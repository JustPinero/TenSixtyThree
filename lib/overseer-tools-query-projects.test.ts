/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { queryProjectsTool } from "@/lib/overseer-tools-query-projects";
import type { ToolContext } from "@/lib/overseer-tools";


let rig: DispatchRig | null = null;
let prisma: PrismaClient;
function ctx(): ToolContext {
  return { prisma };
}

beforeAll(async () => {
  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
});

beforeEach(async () => {
  await prisma.project.deleteMany({});
});

async function seed() {
  const now = Date.now();
  await prisma.project.create({
    data: {
      name: "Cascade",
      slug: "cascade",
      path: "/tmp/c",
      status: "building",
      health: "healthy",
      currentPhase: "phase-12",
      progressScore: 60,
      lastActivityAt: new Date(now),
    },
  });
  await prisma.project.create({
    data: {
      name: "medipal",
      slug: "medipal",
      path: "/tmp/m",
      status: "building",
      health: "blocked",
      currentPhase: "phase-3",
      progressScore: 30,
      lastActivityAt: new Date(now - 1000),
    },
  });
  await prisma.project.create({
    data: {
      name: "Old",
      slug: "old",
      path: "/tmp/o",
      status: "backburner",
      health: "idle",
      lastActivityAt: new Date(now - 100000),
    },
  });
  await prisma.project.create({
    data: {
      name: "Archived",
      slug: "archived-thing",
      path: "/tmp/a",
      status: "archived",
      lastActivityAt: new Date(now - 200000),
    },
  });
}

describe("queryProjectsTool", () => {
  it("declares name + schema", () => {
    expect(queryProjectsTool.name).toBe("query_projects");
    expect(queryProjectsTool.inputSchema).toBeDefined();
  });

  it("excludes backburner + archived by default and orders by lastActivityAt desc", async () => {
    await seed();
    const out = await queryProjectsTool.handler({}, ctx());
    expect(out.projects.map((p) => p.slug)).toEqual(["cascade", "medipal"]);
    expect(out.totalReturned).toBe(2);
  });

  it("includes backburner when includeBackburner=true", async () => {
    await seed();
    const out = await queryProjectsTool.handler({ includeBackburner: true }, ctx());
    expect(out.projects.map((p) => p.slug)).toContain("old");
  });

  it("filters by status", async () => {
    await seed();
    const out = await queryProjectsTool.handler({ status: ["backburner"] }, ctx());
    expect(out.projects.map((p) => p.slug)).toEqual(["old"]);
  });

  it("filters by health", async () => {
    await seed();
    const out = await queryProjectsTool.handler({ health: ["blocked"] }, ctx());
    expect(out.projects.map((p) => p.slug)).toEqual(["medipal"]);
  });

  it("respects limit", async () => {
    await seed();
    const out = await queryProjectsTool.handler({ limit: 1 }, ctx());
    expect(out.totalReturned).toBe(1);
  });

  it("returns ISO strings for lastActivityAt", async () => {
    await seed();
    const out = await queryProjectsTool.handler({ limit: 1 }, ctx());
    expect(out.projects[0].lastActivityAtISO).toMatch(/T.*Z$/);
  });
});
