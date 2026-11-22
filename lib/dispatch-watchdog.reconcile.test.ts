/**
 * Phase 67.1 — the web service's boot-time orphan reconcile is for LOCAL
 * dispatches only. A web deploy used to fail every queued cloud job
 * ("orphaned by server restart") even though the runner — a different
 * service — was about to claim it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { reconcileOrphanedDispatches } from "./dispatch-watchdog";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

describe("reconcileOrphanedDispatches", () => {
  it("fails queued local rows and leaves cloud rows untouched", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const project = await rig.createProject({ slug: "p", path: "/p/p" });
    const mk = (runtime: string) =>
      rig!.prisma.dispatch.create({
        data: {
          projectId: project.id,
          projectSlug: "p",
          mode: "continue",
          runtime,
        },
      });
    const local = await mk("local");
    const cloud = await mk("cloud");

    const result = await reconcileOrphanedDispatches(rig.prisma);

    expect(result.orphaned).toBe(1);
    const after = (id: string) =>
      rig!.prisma.dispatch.findUniqueOrThrow({ where: { id } });
    expect((await after(local.id)).status).toBe("failed");
    expect((await after(cloud.id)).status).toBe("queued");
  });

  it("does not overwrite a row that left 'queued' between read and write", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const project = await rig.createProject({ slug: "p", path: "/p/p" });
    const row = await rig.prisma.dispatch.create({
      data: { projectId: project.id, projectSlug: "p", mode: "continue" },
    });
    // Simulate the race: the dispatcher starts the row as reconcile runs.
    const realFindMany = rig.prisma.dispatch.findMany.bind(rig.prisma.dispatch);
    const raced = new Proxy(rig.prisma, {
      get(target, prop) {
        if (prop !== "dispatch") return Reflect.get(target, prop);
        return new Proxy(target.dispatch, {
          get(d, key) {
            if (key !== "findMany") return Reflect.get(d, key);
            return async (args: Parameters<typeof realFindMany>[0]) => {
              const rows = await realFindMany(args);
              await target.dispatch.update({
                where: { id: row.id },
                data: { status: "started" },
              });
              return rows;
            };
          },
        });
      },
    });
    const result = await reconcileOrphanedDispatches(raced);
    expect(result.orphaned).toBe(0);
    expect(
      (await rig.prisma.dispatch.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe("started");
  });
});
