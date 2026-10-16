/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { yesterdaySummaryTool } from "@/lib/overseer-tools-yesterday-summary";
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
  await prisma.chatMessage.deleteMany({});
});

function dateNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}

describe("yesterdaySummaryTool", () => {
  it("returns found:false with empty messages when no rows for that date", async () => {
    const out = await yesterdaySummaryTool.handler({}, ctx());
    expect(out.found).toBe(false);
    expect(out.messages).toEqual([]);
  });

  it("returns the latest 3 assistant messages from yesterday in chronological order", async () => {
    const yesterday = dateNDaysAgo(1);
    for (let i = 1; i <= 5; i++) {
      await prisma.chatMessage.create({
        data: {
          role: "assistant",
          content: `assistant message ${i}`,
          sessionDate: yesterday,
        },
      });
    }
    // user messages on the same day should be ignored
    await prisma.chatMessage.create({
      data: { role: "user", content: "user msg", sessionDate: yesterday },
    });

    const out = await yesterdaySummaryTool.handler({}, ctx());
    expect(out.found).toBe(true);
    expect(out.messages.length).toBe(3);
    // chronological — oldest of the latest 3 first
    expect(out.messages[0].content).toBe("assistant message 3");
    expect(out.messages[2].content).toBe("assistant message 5");
  });

  it("respects daysAgo (e.g. daysAgo=2 looks at the day before yesterday)", async () => {
    const dayBefore = dateNDaysAgo(2);
    await prisma.chatMessage.create({
      data: { role: "assistant", content: "older", sessionDate: dayBefore },
    });

    const out = await yesterdaySummaryTool.handler({ daysAgo: 2 }, ctx());
    expect(out.found).toBe(true);
    expect(out.messages[0].content).toBe("older");
  });

  it("truncates each message at perMessageMaxChars", async () => {
    const yesterday = dateNDaysAgo(1);
    await prisma.chatMessage.create({
      data: { role: "assistant", content: "x".repeat(1000), sessionDate: yesterday },
    });

    const out = await yesterdaySummaryTool.handler(
      { perMessageMaxChars: 50 },
      ctx()
    );
    expect(out.messages[0].content.length).toBe(50);
  });
});
