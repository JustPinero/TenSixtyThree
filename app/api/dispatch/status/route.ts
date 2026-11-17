import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getDispatchQueue } from "@/lib/dispatch-queue";
import { requireUser, viewerUserId } from "@/lib/access";
import { visibleProjectFilter } from "@/lib/project-access";
import { PUBLIC_DISPATCH_SELECT, publicDispatch } from "@/lib/runner/public-dispatch";

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
export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  const queue = getDispatchQueue();
  const { running, pending } = queue.size();

  // 52.3 — recent cloud runs for the runner panel (and ops smoke checks).
  // 64/65.1 — only runs on projects the caller can see; explicit fields.
  const visible = {
    project: await visibleProjectFilter(prisma, viewerUserId(access.viewer)),
  };
  const recentCloud = await prisma.dispatch.findMany({
    where: { runtime: "cloud", ...visible },
    orderBy: { enqueuedAt: "desc" },
    take: 5,
    select: PUBLIC_DISPATCH_SELECT,
  });

  const now = new Date();
  const [queued, started, overdue] = await Promise.all([
    prisma.dispatch.count({ where: { status: "queued", ...visible } }),
    prisma.dispatch.count({ where: { status: "started", ...visible } }),
    prisma.dispatch.count({
      where: {
        ...visible,
        status: { in: ["queued", "started"] },
        expectedBy: { lt: now },
      },
    }),
  ]);

  return NextResponse.json(
    {
      queue: { running, pending, capacity: queue.capacity() },
      recentCloud: recentCloud.map(publicDispatch),
    dispatches: { queued, started, overdue },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
