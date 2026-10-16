/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { recentActivityTool } from "@/lib/overseer-tools-recent-activity";
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
  await prisma.activityEvent.deleteMany({});
  await prisma.project.deleteMany({});
});

describe("recentActivityTool", () => {
  it("returns events ordered newest-first with project info populated", async () => {
    const project = await prisma.project.create({
      data: { name: "Cascade", slug: "cascade", path: "/tmp/c" },
    });
    await prisma.activityEvent.create({
      data: { projectId: project.id, eventType: "phase-complete", summary: "phase 1 done" },
    });
    await prisma.activityEvent.create({
      data: { eventType: "lesson-harvested", summary: "Harvested 5 lessons" },
    });

    const out = await recentActivityTool.handler({}, ctx());
    expect(out.totalReturned).toBe(2);
    // newest first — the cross-project event was created last
    expect(out.events[0].eventType).toBe("lesson-harvested");
    expect(out.events[0].projectSlug).toBeNull();
    expect(out.events[1].projectSlug).toBe("cascade");
    expect(out.events[1].projectName).toBe("Cascade");
  });

  it("filters by projectSlug", async () => {
    const a = await prisma.project.create({ data: { name: "A", slug: "a", path: "/tmp/a" } });
    const b = await prisma.project.create({ data: { name: "B", slug: "b", path: "/tmp/b" } });
    await prisma.activityEvent.create({
      data: { projectId: a.id, eventType: "commit", summary: "x" },
    });
    await prisma.activityEvent.create({
      data: { projectId: b.id, eventType: "commit", summary: "y" },
    });

    const out = await recentActivityTool.handler({ projectSlug: "a" }, ctx());
    expect(out.totalReturned).toBe(1);
    expect(out.events[0].projectSlug).toBe("a");
  });

  it("filters by eventType", async () => {
    await prisma.activityEvent.create({
      data: { eventType: "commit", summary: "x" },
    });
    await prisma.activityEvent.create({
      data: { eventType: "audit-complete", summary: "y" },
    });

    const out = await recentActivityTool.handler({ eventType: "commit" }, ctx());
    expect(out.totalReturned).toBe(1);
    expect(out.events[0].eventType).toBe("commit");
  });

  it("respects limit", async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.activityEvent.create({
        data: { eventType: "commit", summary: `event ${i}` },
      });
    }
    const out = await recentActivityTool.handler({ limit: 2 }, ctx());
    expect(out.totalReturned).toBe(2);
  });
});
