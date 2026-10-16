/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { updateSessionMemoryTool } from "@/lib/overseer-tools-update-memory";
import { ToolRegistry, type ToolContext } from "@/lib/overseer-tools";
import { closeSession } from "@/lib/chat-session";


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

describe("updateSessionMemoryTool", () => {
  it("deep-merges patch into the session's working memory and persists", async () => {
    const session = await prisma.chatSession.create({
      data: { workingMemory: JSON.stringify({ covered: { medipal: { progress: 30 } } }) },
    });
    const ctx: ToolContext = { prisma, sessionId: session.id };

    const out = await updateSessionMemoryTool.handler(
      { patch: { covered: { ratracer: { blocker: "playwright flake" } } } },
      ctx
    );

    expect(out.newState.covered).toMatchObject({
      medipal: { progress: 30 },
      ratracer: { blocker: "playwright flake" },
    });

    const reloaded = await prisma.chatSession.findUnique({ where: { id: session.id } });
    expect(JSON.parse(reloaded!.workingMemory)).toEqual(out.newState);
  });

  it("via the registry returns {ok:false, error} when ctx.sessionId is missing", async () => {
    const reg = new ToolRegistry();
    reg.register(updateSessionMemoryTool);
    const result = await reg.execute(
      "update_session_memory",
      { patch: { foo: "bar" } },
      { prisma } // no sessionId
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sessionId/);
  });

  it("via the registry returns {ok:false, error} when the session is closed", async () => {
    const session = await prisma.chatSession.create({ data: {} });
    await closeSession(prisma, session.id);

    const reg = new ToolRegistry();
    reg.register(updateSessionMemoryTool);
    const result = await reg.execute(
      "update_session_memory",
      { patch: { foo: "bar" } },
      { prisma, sessionId: session.id }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/closed/i);
  });
});
