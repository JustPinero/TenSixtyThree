/** 52.3 — secret-gated operator surface (headless seeding/observability). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
  vi.unstubAllEnvs();
});

async function load(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return await import("./route");
}

function req(secret: string | null, body: unknown) {
  return new NextRequest("http://x/api/admin/ops", {
    method: "POST",
    headers: secret ? { "x-ops-secret": secret } : {},
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/ops", () => {
  it("404s when OPS_SECRET is unset (surface disabled)", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    expect((await route.POST(req("x", { op: "cloud-status" }))).status).toBe(404);
  });

  it("401s a wrong secret", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    vi.stubEnv("OPS_SECRET", "s3cret-s3cret-s3cret");
    const route = await load(rig);
    expect((await route.POST(req("nope", { op: "cloud-status" }))).status).toBe(401);
    expect((await route.POST(req(null, { op: "cloud-status" }))).status).toBe(401);
  });

  it("seed-project upserts; enqueue-cloud queues; cloud-status reports", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    vi.stubEnv("OPS_SECRET", "s3cret-s3cret-s3cret");
    const route = await load(rig);

    const seeded = await route.POST(
      req("s3cret-s3cret-s3cret", {
        op: "seed-project",
        name: "Real",
        slug: "real",
        githubRepo: "just/real",
      })
    );
    expect(seeded.status).toBe(200);
    // idempotent
    expect(
      (
        await route.POST(
          req("s3cret-s3cret-s3cret", {
            op: "seed-project",
            name: "Real",
            slug: "real",
            githubRepo: "just/real",
          })
        )
      ).status
    ).toBe(200);
    expect(await rig.prisma.project.count({ where: { slug: "real" } })).toBe(1);

    const queued = await route.POST(
      req("s3cret-s3cret-s3cret", {
        op: "enqueue-cloud",
        slug: "real",
        mode: "audit",
      })
    );
    expect(queued.status).toBe(200);
    const { dispatch } = await queued.json();
    expect(dispatch.runtime).toBe("cloud");

    const status = await route.POST(
      req("s3cret-s3cret-s3cret", { op: "cloud-status" })
    );
    const data = await status.json();
    expect(data.recent[0].id).toBe(dispatch.id);
    expect(data.recent[0].status).toBe("queued");
  });

  it("400s unknown ops and invalid payloads", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    vi.stubEnv("OPS_SECRET", "s3cret-s3cret-s3cret");
    const route = await load(rig);
    expect(
      (await route.POST(req("s3cret-s3cret-s3cret", { op: "drop-tables" }))).status
    ).toBe(400);
    expect(
      (
        await route.POST(
          req("s3cret-s3cret-s3cret", { op: "seed-project", slug: "" })
        )
      ).status
    ).toBe(400);
  });
});
