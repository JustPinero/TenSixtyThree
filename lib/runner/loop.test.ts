/** 52.2 — single runner tick: requeue, claim, execute. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { runnerTick } from "./loop";
import type { RunnerMessage } from "./lifecycle";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

function fakeDeps() {
  async function* runAgent(): AsyncGenerator<RunnerMessage> {
    yield { type: "assistant", text: "hi" };
    yield {
      type: "result",
      subtype: "success",
      totalCostUsd: 0.1,
      numTurns: 1,
      usage: {},
    };
  }
  return {
    cloneRepo: vi.fn().mockResolvedValue("/tmp/x"),
    runAgent,
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
}

describe("runnerTick", () => {
  it("claims and completes one queued cloud dispatch, returns true", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    // 65.4 — the claim-time check needs an owner who may still drive it.
    await rig.prisma.user.create({
      data: { id: "owner", name: "o", email: "o@x.dev" },
    });
    const project = await rig.prisma.project.create({
      data: { name: "P", slug: "p", path: "/p/p", githubRepo: "just/p", ownerUserId: "owner" },
    });
    const dispatch = await rig.prisma.dispatch.create({
      data: {
        projectId: project.id,
        projectSlug: "p",
        ownerUserId: "owner",
        mode: "continue",
        runtime: "cloud",
        status: "queued",
      },
    });

    const worked = await runnerTick(rig.prisma, "r1", fakeDeps());
    expect(worked).toBe(true);
    expect(
      (await rig.prisma.dispatch.findUnique({ where: { id: dispatch.id } }))
        ?.status
    ).toBe("completed");
  });

  it("returns false on an empty queue", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    expect(await runnerTick(rig.prisma, "r1", fakeDeps())).toBe(false);
  });
});

describe("67.1 — shutdown", () => {
  it("a shutting-down runner claims nothing", async () => {
    const { createDispatchRig } = await import("@/tests/harness/dispatch-rig");
    const { runnerTick } = await import("./loop");
    const r = await createDispatchRig({ fakeTimers: false });
    try {
      const project = await r.createProject({ slug: "p", path: "/p/p" });
      const row = await r.prisma.dispatch.create({
        data: { projectId: project.id, projectSlug: "p", mode: "audit", runtime: "cloud" },
      });
      const stop = new AbortController();
      stop.abort();
      const worked = await runnerTick(
        r.prisma,
        "r1",
        {
          cloneRepo: async () => "/tmp/x",
          runAgent: async function* () {},
          cleanup: async () => {},
        },
        { signal: stop.signal },
      );
      expect(worked).toBe(false);
      expect((await r.prisma.dispatch.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
        "queued",
      );
    } finally {
      await r.dispose();
    }
  });
});
