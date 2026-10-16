/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { sessionStateTool } from "@/lib/overseer-tools-session-state";
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

describe("sessionStateTool", () => {
  it("returns sessionId, activeFlow, and parsed workingMemory", async () => {
    const session = await prisma.chatSession.create({
      data: {
        activeFlow: "inventory_walk",
        workingMemory: JSON.stringify({ covered: { medipal: { progress: 40 } } }),
      },
    });
    const ctx: ToolContext = { prisma, sessionId: session.id };
    const out = await sessionStateTool.handler({}, ctx);

    expect(out.sessionId).toBe(session.id);
    expect(out.activeFlow).toBe("inventory_walk");
    expect(out.workingMemory).toEqual({ covered: { medipal: { progress: 40 } } });
  });

  it("returns workingMemory as {} for an empty session", async () => {
    const session = await prisma.chatSession.create({ data: {} });
    const out = await sessionStateTool.handler(
      {},
      { prisma, sessionId: session.id }
    );
    expect(out.workingMemory).toEqual({});
    expect(out.activeFlow).toBeNull();
  });

  it("succeeds on a closed session — read-only, archeology is a legitimate use case (Phase 15)", async () => {
    const session = await prisma.chatSession.create({
      data: {
        closedAt: new Date(),
        activeFlow: "inventory_walk",
        workingMemory: JSON.stringify({ covered: { x: 1 } }),
      },
    });
    const out = await sessionStateTool.handler(
      {},
      { prisma, sessionId: session.id }
    );
    expect(out.sessionId).toBe(session.id);
    expect(out.activeFlow).toBe("inventory_walk");
    expect(out.workingMemory).toEqual({ covered: { x: 1 } });
  });

  it("returns tool error when ctx.sessionId is missing", async () => {
    const reg = new ToolRegistry();
    reg.register(sessionStateTool);
    const result = await reg.execute("get_session_state", {}, { prisma });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sessionId/);
  });
});
