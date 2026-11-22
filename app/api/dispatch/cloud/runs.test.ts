/**
 * Phase 67.2/67.4 — cloud run history and cancel, through the
 * visibility matrix.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => {
  const proxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      const inj = (globalThis as Record<string, unknown>).__rigPrisma;
      if (!inj) throw new Error("rig prisma not injected");
      return (inj as Record<string, unknown>)[prop as string];
    },
  });
  return { prisma: proxy };
});

const verify = vi.fn(async (): Promise<{ ok: boolean; reason?: string }> => ({ ok: true }));
vi.mock("@/lib/github-access", async (orig) => ({
  ...(await orig<typeof import("@/lib/github-access")>()),
  verifyRepoPushAccess: () => verify(),
}));

import { GET as listRuns, POST as enqueue } from "./route";
import { POST as cancel } from "./[id]/cancel/route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  seedTenants,
  requestAs,
  type Tenants,
  type TenantUser,
} from "@/tests/harness/tenants";

let rig: DispatchRig | null = null;
let t: Tenants;

beforeEach(async () => {
  process.env.AUTH_REQUIRED = "true";
  rig = await createDispatchRig({ fakeTimers: false });
  (globalThis as Record<string, unknown>).__rigPrisma = rig.prisma;
  t = await seedTenants(rig.prisma);
});

afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  delete (globalThis as Record<string, unknown>).__rigPrisma;
  await rig?.dispose();
  rig = null;
});

function run(status: string, extra: Record<string, unknown> = {}) {
  return rig!.prisma.dispatch.create({
    data: {
      projectId: t.projects.alices.id,
      projectSlug: "alices",
      ownerUserId: "alice",
      mode: "audit",
      runtime: "cloud",
      status,
      ...extra,
    },
  });
}

const cancelAs = (u: TenantUser, id: string) =>
  cancel(
    requestAs(u, `http://x/api/dispatch/cloud/${id}/cancel`, {
      method: "POST",
    }),
    {
      params: Promise.resolve({ id }),
    },
  );

describe("GET /api/dispatch/cloud?projectSlug=", () => {
  it("lists the project's cloud runs, newest first, with status/cost/branch/reason", async () => {
    await run("completed", { costUsd: 0.4, resultBranch: "cloud/a-1" });
    await run("failed", { errorMessage: "Stopped: hit the turn limit." });
    await rig!.prisma.dispatch.create({
      data: {
        projectId: t.projects.alices.id,
        projectSlug: "alices",
        mode: "continue",
      },
    }); // local — not a cloud run
    const res = await listRuns(
      requestAs("alice", "http://x/api/dispatch/cloud?projectSlug=alices"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: Record<string, unknown>[] };
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0]).toMatchObject({
      status: "failed",
      errorMessage: expect.any(String),
    });
    expect(body.runs[1]).toMatchObject({
      costUsd: 0.4,
      resultBranch: "cloud/a-1",
    });
    expect(body.runs[0]).not.toHaveProperty("runnerId");
  });

  it("another tenant's project is a 404", async () => {
    await run("completed");
    const res = await listRuns(
      requestAs("carol", "http://x/api/dispatch/cloud?projectSlug=alices"),
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/dispatch/cloud/[id]/cancel", () => {
  it("cancelling a queued run ends it at once", async () => {
    const row = await run("queued");
    expect((await cancelAs("alice", row.id)).status).toBe(200);
    const after = await rig!.prisma.dispatch.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after.status).toBe("failed");
    expect(after.errorMessage).toMatch(/cancelled/i);
  });

  it("cancelling a running job flags it for the runner", async () => {
    const row = await run("started", { runnerId: "r1", startedAt: new Date() });
    expect((await cancelAs("alice", row.id)).status).toBe(200);
    const after = await rig!.prisma.dispatch.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(after.status).toBe("started");
    expect(after.cancelRequested).toBe(true);
  });

  it("a finished run cannot be cancelled", async () => {
    const row = await run("completed");
    expect((await cancelAs("alice", row.id)).status).toBe(409);
  });

  it("someone who cannot drive the project gets a 404", async () => {
    const row = await run("queued");
    expect((await cancelAs("carol", row.id)).status).toBe(404);
    expect((await cancelAs("bob", row.id)).status).toBe(404);
  });
});

describe("security review — push access is re-checked at dispatch time", () => {
  beforeEach(async () => {
    await rig!.prisma.project.update({
      where: { id: t.projects.alices.id },
      data: { githubRepo: "alice/app" },
    });
    await rig!.prisma.user.update({
      where: { id: "alice" },
      data: { anthropicKeyEnc: "sealed" },
    });
  });
  const start = (u: TenantUser) =>
    enqueue(
      requestAs(u, "http://x/api/dispatch/cloud", {
        method: "POST",
        body: { slug: "alices", mode: "audit" },
      }),
    );

  it("a user who lost push access since connecting cannot start a run", async () => {
    verify.mockResolvedValueOnce({ ok: false, reason: "no-push" });
    const res = await start("alice");
    expect(res.status).toBe(403);
    expect(await rig!.prisma.dispatch.count({ where: { runtime: "cloud" } })).toBe(0);
  });

  it("with push access the run is queued", async () => {
    verify.mockResolvedValueOnce({ ok: true });
    expect((await start("alice")).status).toBeLessThan(300);
  });
});

