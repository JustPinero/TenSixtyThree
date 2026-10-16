/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createReminderTool } from "@/lib/overseer-tools-create-reminder";
import { ToolRegistry, type ToolContext } from "@/lib/overseer-tools";


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
  await prisma.reminder.deleteMany({});
});

describe("createReminderTool", () => {
  it("creates a reminder row with the given fields", async () => {
    const out = await createReminderTool.handler(
      {
        conditionType: "phase-complete",
        conditionValue: "ratracer:phase-2",
        message: "Review the auth implementation before phase 3",
        projectSlug: "ratracer",
      },
      ctx()
    );
    expect(out.id).toBeDefined();
    expect(out.message).toContain("Review");
    expect(out.conditionType).toBe("phase-complete");

    const row = await prisma.reminder.findUnique({ where: { id: out.id } });
    expect(row?.projectSlug).toBe("ratracer");
    expect(row?.createdBy).toBe("delamain");
  });

  it("rejects unknown conditionType via the registry", async () => {
    const reg = new ToolRegistry();
    reg.register(createReminderTool);
    const result = await reg.execute(
      "create_reminder",
      {
        conditionType: "imaginary",
        conditionValue: "x",
        message: "y",
      },
      { prisma }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown conditionType/);
  });
});
