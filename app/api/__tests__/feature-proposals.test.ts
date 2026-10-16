/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";


let rig: DispatchRig | null = null;
let prisma: PrismaClient;
let projectId: number;
let featureId: number;
let proposalId: number;

beforeAll(async () => {
  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;

  const feature = await prisma.upstreamFeature.create({
    data: {
      vendor: "anthropic",
      name: "Stop Hook",
      category: "hook",
      description: "x",
      integrationRecipe: "y",
      detector: "detectsStopHook",
    },
  });
  featureId = feature.id;

  const project = await prisma.project.create({
    data: { name: "demo", slug: "demo", path: "/tmp/demo" },
  });
  projectId = project.id;

  const proposal = await prisma.featureProposal.create({
    data: { projectId, featureId, diff: "DIFF" },
  });
  proposalId = proposal.id;
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
});

beforeEach(() => {
  vi.doMock("@/lib/db", () => ({ prisma }));
  vi.resetModules();
});

function makeRequest(url: string, init?: RequestInit) {
  return new Request(url, init) as unknown as import("next/server").NextRequest;
}

// ----------------------------------------------------------------------------

describe("GET /api/feature-proposals", () => {
  it("returns proposals (newest-first) with feature + project relations inlined", async () => {
    const { GET } = await import("@/app/api/feature-proposals/route");
    const res = await GET(makeRequest("http://localhost/api/feature-proposals"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBeGreaterThan(0);
    expect(body.proposals[0]).toHaveProperty("feature.name");
    expect(body.proposals[0]).toHaveProperty("project.slug");
  });

  it("filters by status", async () => {
    const { GET } = await import("@/app/api/feature-proposals/route");
    const res = await GET(
      makeRequest("http://localhost/api/feature-proposals?status=accepted"),
    );
    const body = await res.json();
    expect(body.count).toBe(0);
  });

  it("rejects invalid status", async () => {
    const { GET } = await import("@/app/api/feature-proposals/route");
    const res = await GET(
      makeRequest("http://localhost/api/feature-proposals?status=garbage"),
    );
    expect(res.status).toBe(400);
  });

  it("filters by project slug; 404 on unknown slug", async () => {
    const { GET } = await import("@/app/api/feature-proposals/route");
    const ok = await GET(
      makeRequest("http://localhost/api/feature-proposals?project=demo"),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).count).toBeGreaterThan(0);

    const miss = await GET(
      makeRequest("http://localhost/api/feature-proposals?project=ghost"),
    );
    expect(miss.status).toBe(404);
  });

  it("clamps limit to 1..200", async () => {
    const { GET } = await import("@/app/api/feature-proposals/route");
    const r1 = await GET(
      makeRequest("http://localhost/api/feature-proposals?limit=9999"),
    );
    expect((await r1.json()).limit).toBe(200);
    const r2 = await GET(
      makeRequest("http://localhost/api/feature-proposals?limit=0"),
    );
    expect((await r2.json()).limit).toBe(1);
  });
});

// ----------------------------------------------------------------------------

describe("GET /api/feature-proposals/[id]", () => {
  it("returns the proposal", async () => {
    const { GET } = await import("@/app/api/feature-proposals/[id]/route");
    const res = await GET(
      makeRequest(`http://localhost/api/feature-proposals/${proposalId}`),
      { params: { id: String(proposalId) } } as never,
    );
    const body = await res.json();
    expect(body.proposal.diff).toBe("DIFF");
  });

  it("404s on unknown id", async () => {
    const { GET } = await import("@/app/api/feature-proposals/[id]/route");
    const res = await GET(
      makeRequest("http://localhost/api/feature-proposals/999999"),
      { params: { id: "999999" } } as never,
    );
    expect(res.status).toBe(404);
  });

  it("400s on non-numeric id", async () => {
    const { GET } = await import("@/app/api/feature-proposals/[id]/route");
    const res = await GET(
      makeRequest("http://localhost/api/feature-proposals/abc"),
      { params: { id: "abc" } } as never,
    );
    expect(res.status).toBe(400);
  });
});

// ----------------------------------------------------------------------------

describe("PATCH /api/feature-proposals/[id]", () => {
  it("transitions to accepted; sets resolvedAt and resolvedBy", async () => {
    const { PATCH } = await import("@/app/api/feature-proposals/[id]/route");
    const res = await PATCH(
      makeRequest(`http://localhost/api/feature-proposals/${proposalId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "accepted", notes: "looks good" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: String(proposalId) } } as never,
    );
    const body = await res.json();
    expect(body.proposal.status).toBe("accepted");
    expect(body.proposal.resolvedAt).toBeTruthy();
    expect(body.proposal.resolvedBy).toBe("user");
    expect(body.proposal.notes).toBe("looks good");
  });

  it("clears resolvedAt when transitioning back to proposed", async () => {
    const { PATCH } = await import("@/app/api/feature-proposals/[id]/route");
    const res = await PATCH(
      makeRequest(`http://localhost/api/feature-proposals/${proposalId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "proposed" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: String(proposalId) } } as never,
    );
    const body = await res.json();
    expect(body.proposal.status).toBe("proposed");
    expect(body.proposal.resolvedAt).toBeNull();
  });

  it("rejects invalid status", async () => {
    const { PATCH } = await import("@/app/api/feature-proposals/[id]/route");
    const res = await PATCH(
      makeRequest(`http://localhost/api/feature-proposals/${proposalId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "weird" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: String(proposalId) } } as never,
    );
    expect(res.status).toBe(400);
  });

  it("rejects malformed body", async () => {
    const { PATCH } = await import("@/app/api/feature-proposals/[id]/route");
    const res = await PATCH(
      makeRequest(`http://localhost/api/feature-proposals/${proposalId}`, {
        method: "PATCH",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: String(proposalId) } } as never,
    );
    expect(res.status).toBe(400);
  });

  it("404s on unknown id", async () => {
    const { PATCH } = await import("@/app/api/feature-proposals/[id]/route");
    const res = await PATCH(
      makeRequest("http://localhost/api/feature-proposals/999999", {
        method: "PATCH",
        body: JSON.stringify({ status: "accepted" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: "999999" } } as never,
    );
    expect(res.status).toBe(404);
  });
});
