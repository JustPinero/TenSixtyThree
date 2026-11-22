/**
 * Phase 67 — cloud runner reliability.
 *
 * 67.1 deploys don't eat jobs (SIGTERM requeues); 67.2 bounded retries,
 * fenced results, wall-clock limit, cancel; 67.3 failures explain
 * themselves, partial work is pushed, signals reach the same writers as
 * local sessions.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { Dispatch } from "@/app/generated/prisma/client";
import { runClaimedDispatch, type RunnerDeps } from "./job";
import type { RunnerMessage } from "./lifecycle";
import {
  claimNextCloudDispatch,
  requeueStaleClaims,
  MAX_ATTEMPTS,
} from "./claim";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

async function setup(extra: Partial<Dispatch> = {}) {
  rig = await createDispatchRig({ fakeTimers: false });
  await rig.prisma.user.create({
    data: { id: "owner", name: "o", email: "o@x.dev" },
  });
  const project = await rig.prisma.project.create({
    data: {
      name: "P",
      slug: "p",
      path: "/p/p",
      githubRepo: "just/p",
      ownerUserId: "owner",
      autonomyMode: "full",
    },
  });
  const dispatch = await rig.prisma.dispatch.create({
    data: {
      projectId: project.id,
      projectSlug: "p",
      ownerUserId: "owner",
      mode: "audit",
      runtime: "cloud",
      status: "started",
      runnerId: "r1",
      startedAt: new Date(),
      attempts: 1,
      ...extra,
    },
  });
  return { r: rig, project, dispatch };
}

const RESULT = (subtype: string): RunnerMessage => ({
  type: "result",
  subtype,
  totalCostUsd: 0.25,
  numTurns: 7,
  usage: {},
});

/** An agent that says one thing, then waits until aborted. */
function hangingAgent(): RunnerDeps["runAgent"] {
  return async function* ({ signal }) {
    yield { type: "assistant", text: "working" };
    await new Promise((_resolve, reject) => {
      if (signal?.aborted) reject(new Error("aborted"));
      signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  };
}

function deps(over: Partial<RunnerDeps> = {}): RunnerDeps & {
  pushBranch: ReturnType<typeof vi.fn>;
  openPullRequest: ReturnType<typeof vi.fn>;
} {
  return {
    cloneRepo: vi.fn().mockResolvedValue("/tmp/clone"),
    runAgent: async function* () {
      yield RESULT("success");
    },
    cleanup: vi.fn().mockResolvedValue(undefined),
    pushBranch: vi
      .fn()
      .mockResolvedValue({ pushed: true, branch: "cloud/x-1" }),
    openPullRequest: vi
      .fn()
      .mockResolvedValue("https://github.com/just/p/pull/1"),
    ...over,
  } as RunnerDeps & {
    pushBranch: ReturnType<typeof vi.fn>;
    openPullRequest: ReturnType<typeof vi.fn>;
  };
}

async function row(r: DispatchRig, id: string) {
  return r.prisma.dispatch.findUniqueOrThrow({ where: { id } });
}

describe("67.1 — deploys do not eat jobs", () => {
  it("SIGTERM (abort signal) requeues the row with an interrupted reason", async () => {
    const { r, dispatch } = await setup();
    const sigterm = new AbortController();
    const d = deps({ runAgent: hangingAgent() });
    const run = runClaimedDispatch(r.prisma, dispatch, d, {
      signal: sigterm.signal,
    });
    setTimeout(() => sigterm.abort(), 50);
    await run;
    const after = await row(r, dispatch.id);
    expect(after.status).toBe("queued");
    expect(after.runnerId).toBeNull();
    expect(after.errorMessage).toMatch(/interrupted/i);
    expect(d.pushBranch).not.toHaveBeenCalled();
  });

  it("an interruption on the last attempt dead-letters instead of requeueing", async () => {
    const { r, dispatch } = await setup({ attempts: MAX_ATTEMPTS });
    const sigterm = new AbortController();
    const run = runClaimedDispatch(
      r.prisma,
      dispatch,
      deps({ runAgent: hangingAgent() }),
      {
        signal: sigterm.signal,
      },
    );
    setTimeout(() => sigterm.abort(), 50);
    await run;
    const after = await row(r, dispatch.id);
    expect(after.status).toBe("failed");
    expect(after.errorMessage).toMatch(/gave up after 3 attempts/i);
  });
});

describe("67.2 — bounded retries, fenced results", () => {
  it("claiming increments attempts", async () => {
    const { r, dispatch } = await setup({
      status: "queued",
      runnerId: null,
      attempts: 0,
    });
    const claimed = await claimNextCloudDispatch(r.prisma, "r2");
    expect(claimed?.id).toBe(dispatch.id);
    expect(claimed?.attempts).toBe(1);
  });

  it("a stale claim on its last attempt is dead-lettered, earlier ones requeue", async () => {
    const old = new Date(Date.now() - 2 * 3600_000);
    const { r, dispatch } = await setup({
      startedAt: old,
      attempts: MAX_ATTEMPTS,
    });
    const second = await r.prisma.dispatch.create({
      data: {
        projectId: dispatch.projectId,
        projectSlug: "p",
        ownerUserId: "owner",
        mode: "audit",
        runtime: "cloud",
        status: "started",
        runnerId: "r9",
        startedAt: old,
        attempts: 1,
      },
    });
    await requeueStaleClaims(r.prisma, 3600_000);
    expect((await row(r, dispatch.id)).status).toBe("failed");
    expect((await row(r, dispatch.id)).errorMessage).toMatch(
      /gave up after 3 attempts/i,
    );
    expect((await row(r, second.id)).status).toBe("queued");
  });

  it("losing the heartbeat aborts the run: no push, no PR, no finalize", async () => {
    const { r, dispatch } = await setup();
    const d = deps({ runAgent: hangingAgent() });
    const run = runClaimedDispatch(r.prisma, dispatch, d, { heartbeatMs: 20 });
    // Another runner takes the row over.
    await r.prisma.dispatch.update({
      where: { id: dispatch.id },
      data: { runnerId: "thief" },
    });
    await run;
    expect(d.pushBranch).not.toHaveBeenCalled();
    expect(d.openPullRequest).not.toHaveBeenCalled();
    const after = await row(r, dispatch.id);
    expect(after.runnerId).toBe("thief");
    expect(after.status).toBe("started");
  });

  it("the wall-clock limit stops the run as timeout and pushes partial work", async () => {
    const { r, dispatch } = await setup();
    const d = deps({ runAgent: hangingAgent() });
    await runClaimedDispatch(r.prisma, dispatch, d, { wallClockMs: 60 });
    const after = await row(r, dispatch.id);
    expect(after.status).toBe("timeout");
    expect(after.errorMessage).toMatch(/time limit/i);
    expect(d.pushBranch).toHaveBeenCalledWith(
      expect.objectContaining({ partial: true }),
    );
  });

  it("cancelRequested stops the run as cancelled", async () => {
    const { r, dispatch } = await setup();
    const d = deps({ runAgent: hangingAgent() });
    const run = runClaimedDispatch(r.prisma, dispatch, d, { cancelPollMs: 20 });
    await r.prisma.dispatch.update({
      where: { id: dispatch.id },
      data: { cancelRequested: true },
    });
    await run;
    const after = await row(r, dispatch.id);
    expect(after.status).toBe("failed");
    expect(after.errorMessage).toMatch(/cancelled/i);
  });
});

describe("67.3 — failures explain themselves", () => {
  it.each([
    ["error_max_turns", /turn limit/i],
    ["error_max_budget_usd", /budget/i],
    ["error_during_execution", /error during execution/i],
  ])("result subtype %s → specific errorMessage", async (subtype, pattern) => {
    const { r, dispatch } = await setup();
    await runClaimedDispatch(
      r.prisma,
      dispatch,
      deps({
        runAgent: async function* () {
          yield RESULT(subtype);
        },
      }),
    );
    const after = await row(r, dispatch.id);
    expect(after.status).toBe("failed");
    expect(after.errorMessage).toMatch(pattern);
  });

  it("a clone failure says so", async () => {
    const { r, dispatch } = await setup();
    await runClaimedDispatch(
      r.prisma,
      dispatch,
      deps({
        cloneRepo: vi.fn().mockRejectedValue(new Error("repository not found")),
      }),
    );
    expect((await row(r, dispatch.id)).errorMessage).toMatch(/clone failed/i);
  });

  it("a thrown error attempts a partial push labelled as partial", async () => {
    const { r, dispatch } = await setup();
    const d = deps({
      runAgent: async function* () {
        yield { type: "assistant", text: "half done" };
        throw new Error("SDK exploded");
      },
    });
    await runClaimedDispatch(r.prisma, dispatch, d);
    expect(d.pushBranch).toHaveBeenCalledWith(
      expect.objectContaining({ partial: true }),
    );
    const after = await row(r, dispatch.id);
    expect(after.status).toBe("failed");
    expect(after.resultBranch).toBe("cloud/x-1");
  });

  it("cloud signals create HumanTask + lesson rows and an outcome with cost/turns, failed runs included", async () => {
    const { r, project, dispatch } = await setup();
    await runClaimedDispatch(
      r.prisma,
      dispatch,
      deps({
        runAgent: async function* () {
          yield {
            type: "assistant",
            text: "[HUMAN TODO] Rotate the staging key",
          };
          yield {
            type: "assistant",
            text: "[LESSON] Pin the Node version in CI",
          };
          yield RESULT("error_max_turns");
        },
      }),
    );
    const tasks = await r.prisma.humanTask.findMany({
      where: { projectId: project.id },
    });
    expect(tasks.map((t) => t.title)).toContain("Rotate the staging key");
    expect(tasks[0].ownerUserId).toBe("owner");
    const lessons = await r.prisma.knowledgeLesson.findMany({
      where: { sourceProjectId: project.id },
    });
    expect(lessons.map((l) => l.content).join(" ")).toContain(
      "Pin the Node version in CI",
    );
    const outcome = await r.prisma.dispatchOutcome.findFirstOrThrow({
      where: { dispatchId: dispatch.id },
    });
    expect(outcome.costUsd).toBe(0.25);
    expect(outcome.turns).toBe(7);
  });

  it("signal text is scrubbed before it is stored (security review)", async () => {
    const { r, project, dispatch } = await setup();
    const leaked = "sk-ant-api03-ABCDEFGHIJKLMNOP1234";
    await runClaimedDispatch(
      r.prisma,
      dispatch,
      deps({
        runAgent: async function* () {
          yield { type: "assistant", text: `[HUMAN TODO] Rotate ${leaked} now` };
          yield { type: "assistant", text: `[LESSON] Never echo ${leaked}` };
          yield RESULT("success");
        },
      }),
    );
    const stored = JSON.stringify([
      await r.prisma.humanTask.findMany({ where: { projectId: project.id } }),
      await r.prisma.knowledgeLesson.findMany({ where: { sourceProjectId: project.id } }),
      await r.prisma.activityEvent.findMany({ where: { projectId: project.id } }),
    ]);
    expect(stored).not.toContain(leaked);
    expect(stored).toContain("[redacted]");
  });
});

describe("batch review — runner gaps", () => {
  it("a cancelled job is never claimed again, and a stale cancelled claim is failed, not requeued", async () => {
    const old = new Date(Date.now() - 2 * 3600_000);
    const { r, dispatch } = await setup({ startedAt: old, attempts: 1, cancelRequested: true });
    await requeueStaleClaims(r.prisma, 3600_000);
    const after = await row(r, dispatch.id);
    expect(after.status).toBe("failed");
    expect(after.errorMessage).toMatch(/cancel/i);

    await r.prisma.dispatch.update({
      where: { id: dispatch.id },
      data: { status: "queued", runnerId: null, startedAt: null },
    });
    expect(await claimNextCloudDispatch(r.prisma, "r2")).toBeNull();
  });

  it("a stop that lands after the agent finished does not block the PR", async () => {
    const { r, dispatch } = await setup();
    let release: () => void = () => {};
    const d = deps({
      pushBranch: vi.fn(
        () =>
          new Promise<{ pushed: boolean; branch: string | null }>((resolve) => {
            release = () => resolve({ pushed: true, branch: "cloud/x-1" });
          }),
      ),
    });
    const run = runClaimedDispatch(r.prisma, dispatch, d, { cancelPollMs: 10 });
    // Cancel arrives while the final push is in flight.
    await new Promise((res) => setTimeout(res, 20));
    await r.prisma.dispatch.update({ where: { id: dispatch.id }, data: { cancelRequested: true } });
    await new Promise((res) => setTimeout(res, 40));
    release();
    await run;
    expect(d.openPullRequest).toHaveBeenCalled();
    expect((await row(r, dispatch.id)).status).toBe("completed");
  });

  it("claim-time push check: an owner who lost repo access gets a failed run, nothing cloned", async () => {
    const { r, dispatch } = await setup();
    const d = deps({ verifyRepoAccess: vi.fn().mockResolvedValue(false) });
    await runClaimedDispatch(r.prisma, dispatch, d);
    expect(d.cloneRepo).not.toHaveBeenCalled();
    const after = await row(r, dispatch.id);
    expect(after.status).toBe("failed");
    expect(after.errorMessage).toMatch(/push access/i);
  });
});

