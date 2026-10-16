/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { setActiveFlowTool } from "@/lib/overseer-tools-set-flow";
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
});

describe("setActiveFlowTool", () => {
  it("accepts whitelisted flow values and persists them", async () => {
    const session = await prisma.chatSession.create({ data: {} });
    const ctx: ToolContext = { prisma, sessionId: session.id };

    for (const flow of ["inventory_walk", "dispatch_planning", "incident_triage"] as const) {
      const out = await setActiveFlowTool.handler({ flow }, ctx);
      expect(out.flow).toBe(flow);
      const reloaded = await prisma.chatSession.findUnique({
        where: { id: session.id },
      });
      expect(reloaded?.activeFlow).toBe(flow);
    }
  });

  it("clears the flow with null", async () => {
    const session = await prisma.chatSession.create({
      data: { activeFlow: "inventory_walk" },
    });
    const ctx: ToolContext = { prisma, sessionId: session.id };
    await setActiveFlowTool.handler({ flow: null }, ctx);
    const reloaded = await prisma.chatSession.findUnique({
      where: { id: session.id },
    });
    expect(reloaded?.activeFlow).toBeNull();
  });

  it("rejects unknown flow strings via the registry", async () => {
    const session = await prisma.chatSession.create({ data: {} });
    const reg = new ToolRegistry();
    reg.register(setActiveFlowTool);
    const result = await reg.execute(
      "set_active_flow",
      { flow: "nonsense" },
      { prisma, sessionId: session.id }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown flow/);
  });

  it("returns tool error when ctx.sessionId is missing", async () => {
    const reg = new ToolRegistry();
    reg.register(setActiveFlowTool);
    const result = await reg.execute(
      "set_active_flow",
      { flow: "inventory_walk" },
      { prisma }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sessionId/);
  });
});
