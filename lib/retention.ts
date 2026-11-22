/**
 * Phase 70 — telemetry retention.
 *
 * ToolCallEvent, AnthropicUsageEvent and ActivityEvent are append-only
 * and grew without bound. Rows older than RETENTION_DAYS are deleted by a
 * daily sweep started from instrumentation.ts (web service only).
 */
import type { PrismaClient } from "@/app/generated/prisma/client";

export const RETENTION_DAYS = 90;
const DAY_MS = 86_400_000;

export async function sweepTelemetry(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ toolCalls: number; usage: number; activity: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  const before = { createdAt: { lt: cutoff } };
  const [toolCalls, usage, activity] = await Promise.all([
    prisma.toolCallEvent.deleteMany({ where: before }),
    prisma.anthropicUsageEvent.deleteMany({ where: before }),
    prisma.activityEvent.deleteMany({ where: before }),
  ]);
  return {
    toolCalls: toolCalls.count,
    usage: usage.count,
    activity: activity.count,
  };
}

type GlobalWithRetention = typeof globalThis & {
  __cascadeRetentionTimer?: ReturnType<typeof setInterval>;
};

/** Daily sweep; idempotent across HMR re-imports; never throws. */
export function startRetentionSweep(prisma: PrismaClient): void {
  const g = globalThis as GlobalWithRetention;
  if (g.__cascadeRetentionTimer) return;
  const run = () => {
    sweepTelemetry(prisma).catch((err) => {
      console.error("[retention] sweep failed (non-fatal):", err);
    });
  };
  run();
  g.__cascadeRetentionTimer = setInterval(run, DAY_MS);
  g.__cascadeRetentionTimer.unref?.();
}
