/** 52.1 — atomic cloud-dispatch claiming. */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { claimNextCloudDispatch, requeueStaleClaims } from "./claim";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

async function makeProject(r: DispatchRig) {
  return r.prisma.project.create({
    data: { name: "P", slug: "p", path: "/p/p", githubRepo: "just/p" },
  });
}

async function enqueue(r: DispatchRig, projectId: number, runtime = "cloud") {
  return r.prisma.dispatch.create({
    data: {
      projectId,
      projectSlug: "p",
      mode: "continue",
      runtime,
      status: "queued",
    },
  });
}

describe("claimNextCloudDispatch", () => {
  it("claims oldest queued cloud dispatch, stamps runner + started", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const project = await makeProject(rig);
    const first = await enqueue(rig, project.id);
    await enqueue(rig, project.id);
    await enqueue(rig, project.id, "local"); // never claimed by the runner

    const claimed = await claimNextCloudDispatch(rig.prisma, "runner-1");
    expect(claimed?.id).toBe(first.id);
    const row = await rig.prisma.dispatch.findUnique({
      where: { id: first.id },
    });
    expect(row?.status).toBe("started");
    expect(row?.runnerId).toBe("runner-1");
    expect(row?.startedAt).not.toBeNull();
  });

  it("returns null when nothing is queued; never claims local rows", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const project = await makeProject(rig);
    await enqueue(rig, project.id, "local");
    expect(await claimNextCloudDispatch(rig.prisma, "runner-1")).toBeNull();
  });

  it("two concurrent claims never grab the same row", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const project = await makeProject(rig);
    await enqueue(rig, project.id);
    await enqueue(rig, project.id);
    const [a, b] = await Promise.all([
      claimNextCloudDispatch(rig.prisma, "runner-a"),
      claimNextCloudDispatch(rig.prisma, "runner-b"),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);
  });
});

describe("requeueStaleClaims", () => {
  it("requeues cloud rows started too long ago; leaves fresh + local alone", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const project = await makeProject(rig);
    const stale = await rig.prisma.dispatch.create({
      data: {
        projectId: project.id,
        projectSlug: "p",
        mode: "continue",
        runtime: "cloud",
        status: "started",
        runnerId: "dead-runner",
        startedAt: new Date(Date.now() - 3 * 3600_000),
      },
    });
    const fresh = await rig.prisma.dispatch.create({
      data: {
        projectId: project.id,
        projectSlug: "p",
        mode: "continue",
        runtime: "cloud",
        status: "started",
        runnerId: "alive",
        startedAt: new Date(),
      },
    });

    const requeued = await requeueStaleClaims(rig.prisma, 60 * 60_000);
    expect(requeued).toBe(1);
    expect(
      (await rig.prisma.dispatch.findUnique({ where: { id: stale.id } }))
        ?.status,
    ).toBe("queued");
    expect(
      (await rig.prisma.dispatch.findUnique({ where: { id: fresh.id } }))
        ?.status,
    ).toBe("started");
  });
});
