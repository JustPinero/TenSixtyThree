/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { proposeDispatchTool } from "@/lib/overseer-tools-propose-dispatch";
import { ToolRegistry, type ToolContext } from "@/lib/overseer-tools";


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
  await prisma.chatSession.deleteMany({});
  await prisma.project.deleteMany({});
  // Phase 14.3 — propose_dispatch now validates the slug against a
  // real Project row. Seed the slugs the existing tests use.
  for (const slug of ["cascade", "a", "b", "c", "x"]) {
    await prisma.project.create({
      data: { name: slug, slug, path: `/tmp/${slug}` },
    });
  }
});

describe("proposeDispatchTool", () => {
  it("appends to workingMemory.proposedDispatches and persists", async () => {
    const session = await prisma.chatSession.create({ data: {} });
    const ctx: ToolContext = { prisma, sessionId: session.id };

    const out = await proposeDispatchTool.handler(
      { slug: "cascade", mode: "continue", instructions: "finish phase-12" },
      ctx
    );
    expect(out.proposal.slug).toBe("cascade");
    expect(out.proposal.mode).toBe("continue");
    expect(out.proposal.instructions).toBe("finish phase-12");
    expect(out.totalProposed).toBe(1);

    const reloaded = await prisma.chatSession.findUnique({ where: { id: session.id } });
    const wm = JSON.parse(reloaded!.workingMemory);
    expect(wm.proposedDispatches).toHaveLength(1);
    expect(wm.proposedDispatches[0].slug).toBe("cascade");
  });

  it("accumulates multiple proposals across calls", async () => {
    const session = await prisma.chatSession.create({ data: {} });
    const ctx: ToolContext = { prisma, sessionId: session.id };

    await proposeDispatchTool.handler({ slug: "a", mode: "continue" }, ctx);
    await proposeDispatchTool.handler({ slug: "b", mode: "audit" }, ctx);
    const out = await proposeDispatchTool.handler({ slug: "c", mode: "investigate" }, ctx);

    expect(out.totalProposed).toBe(3);
    const reloaded = await prisma.chatSession.findUnique({ where: { id: session.id } });
    const wm = JSON.parse(reloaded!.workingMemory);
    expect(wm.proposedDispatches.map((p: { slug: string }) => p.slug)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("rejects unknown modes via the registry", async () => {
    const session = await prisma.chatSession.create({ data: {} });
    const reg = new ToolRegistry();
    reg.register(proposeDispatchTool);
    const result = await reg.execute(
      "propose_dispatch",
      { slug: "x", mode: "yolo" },
      { prisma, sessionId: session.id }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown mode/);
  });

  it("rejects unknown project slugs (Phase 14.3)", async () => {
    const session = await prisma.chatSession.create({ data: {} });
    const reg = new ToolRegistry();
    reg.register(proposeDispatchTool);
    const result = await reg.execute(
      "propose_dispatch",
      { slug: "definitely-not-a-real-project", mode: "continue" },
      { prisma, sessionId: session.id }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Unknown project slug/);
      expect(result.error).toMatch(/query_projects/);
    }

    // No proposal should have been recorded.
    const reloaded = await prisma.chatSession.findUnique({
      where: { id: session.id },
    });
    const wm = JSON.parse(reloaded!.workingMemory);
    expect(wm.proposedDispatches).toBeUndefined();
  });

  it("returns tool error when ctx.sessionId is missing", async () => {
    const reg = new ToolRegistry();
    reg.register(proposeDispatchTool);
    const result = await reg.execute(
      "propose_dispatch",
      { slug: "x", mode: "continue" },
      { prisma }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sessionId/);
  });
});
