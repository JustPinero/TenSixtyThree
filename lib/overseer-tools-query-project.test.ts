/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { queryProjectTool } from "@/lib/overseer-tools-query-project";
import type { ToolContext } from "@/lib/overseer-tools";


let rig: DispatchRig | null = null;
let prisma: PrismaClient;

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

function ctx(): ToolContext {
  return { prisma };
}

describe("queryProjectTool — shape", () => {
  it("declares name, description, and a slug-required input schema", () => {
    expect(queryProjectTool.name).toBe("query_project");
    expect(queryProjectTool.description.length).toBeGreaterThan(0);
    const schema = queryProjectTool.inputSchema as {
      type: string;
      properties: { slug: { type: string } };
      required: string[];
    };
    expect(schema.type).toBe("object");
    expect(schema.properties.slug.type).toBe("string");
    expect(schema.required).toContain("slug");
  });
});

describe("queryProjectTool — handler", () => {
  it("returns found:true with core fields when the project exists", async () => {
    await prisma.project.create({
      data: {
        name: "Cascade",
        slug: "cascade",
        path: "/tmp/cascade",
        status: "building",
        health: "healthy",
        currentPhase: "phase-12-overseer-tools",
        progressScore: 60,
        businessStage: "internal",
      },
    });

    const out = await queryProjectTool.handler({ slug: "cascade" }, ctx());

    expect(out.found).toBe(true);
    expect(out.slug).toBe("cascade");
    expect(out.name).toBe("Cascade");
    expect(out.status).toBe("building");
    expect(out.health).toBe("healthy");
    expect(out.phase).toBe("phase-12-overseer-tools");
    expect(out.progressScore).toBe(60);
    expect(out.businessStage).toBe("internal");
  });

  it("returns found:false when the project does not exist", async () => {
    const out = await queryProjectTool.handler(
      { slug: "missing-thing" },
      ctx()
    );
    expect(out).toEqual({ found: false, slug: "missing-thing" });
  });

  it("surfaces parsed progressBreakdown from progressDetails JSON", async () => {
    await prisma.project.create({
      data: {
        name: "X",
        slug: "x",
        path: "/tmp/x",
        progressDetails: JSON.stringify({
          phases: { completed: 3, total: 5 },
          tests: { fileCount: 12 },
          readiness: { hasTypeCheck: true, hasLint: false, hasBuild: true },
        }),
      },
    });

    const out = await queryProjectTool.handler({ slug: "x" }, ctx());
    expect(out.progressBreakdown).toEqual({
      phasesCompleted: 3,
      phasesTotal: 5,
      testFiles: 12,
      hasTypeCheck: true,
      hasLint: false,
      hasBuild: true,
    });
  });

  it("tolerates malformed progressDetails JSON (omits progressBreakdown)", async () => {
    await prisma.project.create({
      data: {
        name: "Y",
        slug: "y",
        path: "/tmp/y",
        progressDetails: "{not json",
      },
    });

    const out = await queryProjectTool.handler({ slug: "y" }, ctx());
    expect(out.found).toBe(true);
    expect(out.progressBreakdown).toBeUndefined();
  });

  it("surfaces needsAttention from healthDetails when present", async () => {
    await prisma.project.create({
      data: {
        name: "Z",
        slug: "z",
        path: "/tmp/z",
        healthDetails: JSON.stringify({ needsAttention: "tests failing" }),
      },
    });

    const out = await queryProjectTool.handler({ slug: "z" }, ctx());
    expect(out.needsAttention).toBe("tests failing");
  });

  it("truncates projectContext to 200 and completionCriteria to 150 chars", async () => {
    await prisma.project.create({
      data: {
        name: "Long",
        slug: "long",
        path: "/tmp/long",
        projectContext: "x".repeat(500),
        completionCriteria: "y".repeat(500),
      },
    });

    const out = await queryProjectTool.handler({ slug: "long" }, ctx());
    expect(typeof out.context).toBe("string");
    expect(out.context?.length).toBe(200);
    expect(out.completionCriteria?.length).toBe(150);
  });

  it("returns an ISO string for lastSessionEndedAt when set", async () => {
    const ts = new Date("2026-04-27T12:00:00Z");
    await prisma.project.create({
      data: {
        name: "Recent",
        slug: "recent",
        path: "/tmp/recent",
        lastSessionEndedAt: ts,
      },
    });

    const out = await queryProjectTool.handler({ slug: "recent" }, ctx());
    expect(out.lastSessionEndedAt).toBe("2026-04-27T12:00:00.000Z");
  });
});
