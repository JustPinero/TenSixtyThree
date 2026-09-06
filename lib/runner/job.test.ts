/** 52.1 — claimed-dispatch execution (deps injected). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { runClaimedDispatch } from "./job";
import type { RunnerMessage } from "./lifecycle";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

async function claimed(r: DispatchRig) {
  const project = await r.prisma.project.create({
    data: { name: "P", slug: "p", path: "/p/p", githubRepo: "just/p" },
  });
  const dispatch = await r.prisma.dispatch.create({
    data: {
      projectId: project.id,
      projectSlug: "p",
      mode: "audit",
      runtime: "cloud",
      status: "started",
      runnerId: "r1",
      startedAt: new Date(),
    },
  });
  return { project, dispatch };
}

const HAPPY: RunnerMessage[] = [
  { type: "assistant", text: "Auditing." },
  { type: "tool_use", name: "Bash", input: { command: "pnpm test" } },
  {
    type: "result",
    subtype: "success",
    totalCostUsd: 0.5,
    numTurns: 5,
    usage: {},
  },
];

describe("runClaimedDispatch", () => {
  it("clones, streams, writes events + outcome, completes the row", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { project, dispatch } = await claimed(rig);
    const cloneRepo = vi.fn().mockResolvedValue("/tmp/clone-x");
    async function* runAgent() {
      for (const m of HAPPY) yield m;
    }

    await runClaimedDispatch(rig.prisma, dispatch, {
      cloneRepo,
      runAgent,
      cleanup: vi.fn().mockResolvedValue(undefined),
    });

    expect(cloneRepo).toHaveBeenCalledWith("just/p");
    const row = await rig.prisma.dispatch.findUnique({
      where: { id: dispatch.id },
    });
    expect(row?.status).toBe("completed");
    expect(row?.costUsd).toBe(0.5);
    const outcome = await rig.prisma.dispatchOutcome.findFirst({
      where: { dispatchId: dispatch.id },
    });
    expect(outcome?.outcome).toBe("success");
    const events = await rig.prisma.activityEvent.count({
      where: { projectId: project.id },
    });
    expect(events).toBeGreaterThanOrEqual(1);
  });

  it("agent failure marks the row failed with the error, still cleans up", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { dispatch } = await claimed(rig);
    const cleanup = vi.fn().mockResolvedValue(undefined);
    async function* runAgent(): AsyncGenerator<RunnerMessage> {
      yield { type: "assistant", text: "starting" };
      throw new Error("SDK exploded");
    }

    await runClaimedDispatch(rig.prisma, dispatch, {
      cloneRepo: vi.fn().mockResolvedValue("/tmp/c"),
      runAgent,
      cleanup,
    });

    const row = await rig.prisma.dispatch.findUnique({
      where: { id: dispatch.id },
    });
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toContain("SDK exploded");
    expect(cleanup).toHaveBeenCalled();
  });
});

describe("budget-stop handling (round-4 lesson)", () => {
  it("extracts the spent amount from a budget-stop error into costUsd", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { dispatch } = await claimed(rig);
    async function* runAgent(): AsyncGenerator<RunnerMessage> {
      yield { type: "assistant", text: "auditing" };
      throw new Error(
        "Claude Code process exited with code 1. stderr: Budget limit reached ($5.06 of $5); stopping background agents."
      );
    }
    await runClaimedDispatch(rig.prisma, dispatch, {
      cloneRepo: vi.fn().mockResolvedValue("/tmp/c"),
      runAgent,
      cleanup: vi.fn().mockResolvedValue(undefined),
    });
    const row = await rig.prisma.dispatch.findUnique({
      where: { id: dispatch.id },
    });
    expect(row?.status).toBe("failed");
    expect(row?.costUsd).toBe(5.06);
    expect(row?.errorMessage).toContain("Budget limit");
  });
});
