/** Phase 70 — telemetry retention: 90 days, then gone. */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { sweepTelemetry, RETENTION_DAYS } from "./retention";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

const DAY = 86_400_000;

describe("sweepTelemetry", () => {
  it("deletes tool-call, usage and activity rows older than 90 days, keeps the rest", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const now = new Date("2026-11-22T12:00:00Z");
    const old = new Date(now.getTime() - (RETENTION_DAYS + 1) * DAY);
    const recent = new Date(now.getTime() - 10 * DAY);
    for (const createdAt of [old, recent]) {
      await rig.prisma.toolCallEvent.create({
        data: {
          sessionId: "s",
          iteration: 0,
          toolName: "t",
          input: "{}",
          outputSize: 1,
          success: true,
          durationMs: 1,
          createdAt,
        },
      });
      await rig.prisma.anthropicUsageEvent.create({
        data: {
          callSite: "c",
          model: "m",
          inputTokens: 1,
          outputTokens: 1,
          durationMs: 1,
          createdAt,
        },
      });
      await rig.prisma.activityEvent.create({
        data: { eventType: "commit", summary: "s", createdAt },
      });
    }

    const swept = await sweepTelemetry(rig.prisma, now);

    expect(swept).toEqual({ toolCalls: 1, usage: 1, activity: 1 });
    expect(await rig.prisma.toolCallEvent.count()).toBe(1);
    expect(await rig.prisma.anthropicUsageEvent.count()).toBe(1);
    expect(await rig.prisma.activityEvent.count()).toBe(1);
  });
});
