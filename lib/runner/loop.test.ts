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
    const project = await rig.prisma.project.create({
      data: { name: "P", slug: "p", path: "/p/p", githubRepo: "just/p" },
    });
    const dispatch = await rig.prisma.dispatch.create({
      data: {
        projectId: project.id,
        projectSlug: "p",
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
