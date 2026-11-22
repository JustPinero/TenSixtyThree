/**
 * Phase 66.1 — the fleet-wide slash commands are operator-only, and the
 * proposer runs against the caller's visible projects with their key.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const mockRunFeatureCheck = vi.fn();
const mockProposeForAll = vi.fn();

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

vi.mock("@/lib/anthropic-feature-check", async (orig) => ({
  ...(await orig<typeof import("@/lib/anthropic-feature-check")>()),
  runFeatureCheck: (...a: unknown[]) => mockRunFeatureCheck(...a),
}));

vi.mock("@/lib/anthropic-feature-proposer", async (orig) => ({
  ...(await orig<typeof import("@/lib/anthropic-feature-proposer")>()),
  proposeForAll: (...a: unknown[]) => mockProposeForAll(...a),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockReturnValue(null),
  getRateLimitKey: vi.fn().mockReturnValue("k"),
}));

import { POST } from "./route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  seedTenants,
  requestAs,
  type TenantUser,
} from "@/tests/harness/tenants";

let rig: DispatchRig | null = null;

beforeEach(async () => {
  process.env.AUTH_REQUIRED = "true";
  process.env.ANTHROPIC_API_KEY = "sk-test";
  rig = await createDispatchRig({ fakeTimers: false });
  (globalThis as Record<string, unknown>).__rigPrisma = rig.prisma;
  await seedTenants(rig.prisma);
  mockProposeForAll.mockResolvedValue([]);
  mockRunFeatureCheck.mockResolvedValue({
    catalogSync: { added: 0, updated: 0, unchanged: 0, total: 0 },
    newCandidates: [],
    droppedLowConfidence: [],
    fetchedSources: [],
    usage: { totalProjects: 0, perProject: [] },
  });
});

afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  delete (globalThis as Record<string, unknown>).__rigPrisma;
  await rig?.dispose();
  rig = null;
  vi.clearAllMocks();
});

async function send(user: TenantUser, content: string): Promise<string> {
  const res = await POST(
    requestAs(user, "http://x/api/overseer/chat", {
      method: "POST",
      body: { messages: [{ role: "user", content }] },
    }),
  );
  return res.text();
}

describe("operator-only slash commands", () => {
  it("a regular user cannot run the fleet feature check", async () => {
    const body = await send("alice", "/anthropic-feature-update-check");
    expect(body).toContain("only available to an administrator");
    expect(mockRunFeatureCheck).not.toHaveBeenCalled();
  });

  it("a regular user cannot run the proposer", async () => {
    const body = await send("alice", "/anthropic-feature-propose");
    expect(body).toContain("only available to an administrator");
    expect(mockProposeForAll).not.toHaveBeenCalled();
  });

  it("an admin's proposer run is scoped to visible non-demo projects with the resolved key", async () => {
    await send("admin", "/anthropic-feature-propose");
    expect(mockProposeForAll).toHaveBeenCalledTimes(1);
    const opts = mockProposeForAll.mock.calls[0][1] as {
      projectWhere: unknown;
      deps: { apiKey: string };
    };
    expect(opts.projectWhere).toEqual({ isDemo: false });
    expect(opts.deps.apiKey).toBe("sk-test");
  });
});
