/**
 * Phase 70 — spend attribution: each viewer sees their own spend; admins
 * see the fleet plus app-key spend broken down by user.
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

import { GET } from "./route";
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
  rig = await createDispatchRig({ fakeTimers: false });
  (globalThis as Record<string, unknown>).__rigPrisma = rig.prisma;
  await seedTenants(rig.prisma);
  const row = (userId: string | null, keySource: string, calls: number) =>
    rig!.prisma.anthropicUsageEvent.createMany({
      data: Array.from({ length: calls }, () => ({
        callSite: "overseer.chat",
        model: "claude-sonnet-4-6",
        inputTokens: 1000,
        outputTokens: 1000,
        durationMs: 1,
        userId,
        keySource,
      })),
    });
  await row("alice", "app", 2);
  await row("alice", "byok", 1);
  await row("bob", "app", 3);
  await row(null, "app", 4);
});

afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  delete (globalThis as Record<string, unknown>).__rigPrisma;
  await rig?.dispose();
  rig = null;
});

interface Body {
  scope: "mine" | "fleet";
  calls: number;
  appKeyByUser?: {
    userId: string | null;
    calls: number;
    estimatedCostUsd: number;
  }[];
}

async function summary(u: TenantUser): Promise<Body> {
  const res = await GET(requestAs(u, "http://x/api/usage/summary"));
  expect(res.status).toBe(200);
  return (await res.json()) as Body;
}

describe("usage summary per viewer", () => {
  it("a user sees only their own calls (both keys)", async () => {
    const body = await summary("alice");
    expect(body).toMatchObject({ scope: "mine", calls: 3 });
    expect(body.appKeyByUser).toBeUndefined();
    expect((await summary("carol")).calls).toBe(0);
  });

  it("an admin sees the fleet and app-key spend by user", async () => {
    const body = await summary("admin");
    expect(body).toMatchObject({ scope: "fleet", calls: 10 });
    const byUser = Object.fromEntries(
      (body.appKeyByUser ?? []).map((r) => [r.userId ?? "operator", r.calls]),
    );
    expect(byUser).toEqual({ alice: 2, bob: 3, operator: 4 });
    for (const r of body.appKeyByUser ?? [])
      expect(r.estimatedCostUsd).toBeGreaterThan(0);
  });
});
