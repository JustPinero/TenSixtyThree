/** Phase 60.3 [1.0.D4] — legacy cloud events get their dispatchId column filled. */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { backfillActivityDispatchIds } from "./activity-dispatch-backfill";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

describe("backfillActivityDispatchIds", () => {
  it("fills dispatchId from the legacy details JSON, only for real dispatches", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const project = await rig.createProject({ slug: "p", path: "/p/p" });
    const dispatch = await rig.prisma.dispatch.create({
      data: {
        projectId: project.id,
        projectSlug: "p",
        mode: "audit",
        runtime: "cloud",
      },
    });
    const legacy = await rig.prisma.activityEvent.create({
      data: {
        projectId: project.id,
        eventType: "session-complete",
        summary: "[cloud audit] working",
        details: JSON.stringify({ dispatchId: dispatch.id }),
      },
    });
    const dangling = await rig.prisma.activityEvent.create({
      data: {
        projectId: project.id,
        eventType: "session-complete",
        summary: "orphan",
        details: JSON.stringify({ dispatchId: "does-not-exist" }),
      },
    });
    const unrelated = await rig.prisma.activityEvent.create({
      data: { projectId: project.id, eventType: "commit", summary: "c" },
    });

    expect(await backfillActivityDispatchIds(rig.prisma)).toBe(1);

    const get = (id: number) =>
      rig!.prisma.activityEvent.findUniqueOrThrow({ where: { id } });
    expect((await get(legacy.id)).dispatchId).toBe(dispatch.id);
    expect((await get(dangling.id)).dispatchId).toBeNull();
    expect((await get(unrelated.id)).dispatchId).toBeNull();
    // Idempotent.
    expect(await backfillActivityDispatchIds(rig.prisma)).toBe(0);
  });
});
