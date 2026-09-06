import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDispatchQueue } from "@/lib/dispatch-queue";

/**
 * Phase 38 [P2] — fleet status for the dashboard strip.
 *
 * `queue` is the live in-process singleton (slots held / waiting /
 * cap); `dispatches` are DB row counts. `overdue` — queued/started
 * rows past `expectedBy` that the watchdog hasn't flipped yet — is
 * the human-visible "stuck" alarm for slot leaks (see Phase 37).
 *
 * No-store: the strip polls every 15s and must see live state.
 */
export async function GET() {
  const queue = getDispatchQueue();
  const { running, pending } = queue.size();

  // 52.3 — recent cloud runs for the runner panel (and ops smoke checks).
  const recentCloud = await prisma.dispatch.findMany({
    where: { runtime: "cloud" },
    orderBy: { enqueuedAt: "desc" },
    take: 5,
    select: {
      id: true,
      projectSlug: true,
      mode: true,
      status: true,
      costUsd: true,
      runnerId: true,
      errorMessage: true,
      completedAt: true,
    },
  });

  const now = new Date();
  const [queued, started, overdue] = await Promise.all([
    prisma.dispatch.count({ where: { status: "queued" } }),
    prisma.dispatch.count({ where: { status: "started" } }),
    prisma.dispatch.count({
      where: {
        status: { in: ["queued", "started"] },
        expectedBy: { lt: now },
      },
    }),
  ]);

  return NextResponse.json(
    {
      queue: { running, pending, capacity: queue.capacity() },
      recentCloud: recentCloud.map((d) => ({
      ...d,
      errorMessage: d.errorMessage?.slice(0, 300) ?? null,
    })),
    dispatches: { queued, started, overdue },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
