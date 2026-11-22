/**
 * Phase 65.1/65.4 — who may enqueue a cloud run, how often, on whose key,
 * and what the response reveals.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

// 68.2 — enqueue re-checks the user's own GitHub push access (network);
// these suites cover the other rules, so the check passes here.
vi.mock("@/lib/github-access", async (orig) => ({
  ...(await orig<typeof import("@/lib/github-access")>()),
  verifyRepoPushAccess: async () => ({ ok: true }),
}));
import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { clearRateLimits } from "@/lib/rate-limiter";

let rig: DispatchRig | null = null;
const saved = { ...process.env };
beforeEach(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  process.env = { ...saved };
  clearRateLimits();
  vi.resetModules();
});

async function user(
  r: DispatchRig,
  token: string,
  opts: { role?: string; byok?: boolean } = {},
) {
  const { seal } = await import("@/lib/crypto-box");
  await r.prisma.user.create({
    data: {
      id: `u-${token}`,
      name: token,
      email: `${token}@x.dev`,
      role: opts.role ?? "user",
      anthropicKeyEnc: opts.byok ? seal("sk-ant-" + "k".repeat(30)) : null,
    },
  });
  await r.prisma.session.create({
    data: {
      id: `s-${token}`,
      token,
      userId: `u-${token}`,
      activeOrganizationId: "org",
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
}

async function world(r: DispatchRig) {
  await user(r, "owner", { byok: true });
  await user(r, "member", { byok: true });
  await user(r, "nokey");
  await user(r, "admin", { role: "admin" });
  await r.prisma.organization.create({
    data: { id: "org", name: "Org", slug: "org", createdAt: new Date() },
  });
  await r.prisma.member.create({
    data: { userId: "u-owner", organizationId: "org", role: "owner", createdAt: new Date() },
  });
  await r.prisma.member.create({
    data: { userId: "u-member", organizationId: "org", role: "member", createdAt: new Date() },
  });
  const p = await r.prisma.project.create({
    data: { name: "P", slug: "p", path: "/p/p", githubRepo: "o/p", ownerUserId: "u-owner", autonomyMode: "semi" },
  });
  await r.prisma.orgProjectShare.create({
    data: { organizationId: "org", projectId: p.id, sharedById: "u-owner" },
  });
  const mine = await r.prisma.project.create({
    data: { name: "N", slug: "n", path: "/p/n", githubRepo: "o/n", ownerUserId: "u-nokey" },
  });
  return { p, mine };
}

async function post(r: DispatchRig, token: string, slug: string) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  const { POST } = await import("./route");
  return POST(
    new NextRequest("http://x/api/dispatch/cloud", {
      method: "POST",
      headers: { cookie: `better-auth.session_token=${token}.s` },
      body: JSON.stringify({ slug, mode: "continue" }),
    }),
  );
}

describe("cloud enqueue policy", () => {
  it("plain org member can see but not dispatch → 403", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await world(rig);
    expect((await post(rig, "member", "p")).status).toBe(403);
  });

  it("owner enqueues; response omits internal fields", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await world(rig);
    const res = await post(rig, "owner", "p");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatch.id).toBeTruthy();
    expect(body.dispatch).not.toHaveProperty("idempotencyKey");
    expect(body.dispatch).not.toHaveProperty("runnerId");
    expect(body.dispatch).not.toHaveProperty("prompt");
  });

  it("a second enqueue while one is active → 409", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await world(rig);
    expect((await post(rig, "owner", "p")).status).toBe(200);
    expect((await post(rig, "owner", "p")).status).toBe(409);
  });

  it("non-admin without their own key → 402", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await world(rig);
    const res = await post(rig, "nokey", "n");
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/Anthropic key/);
  });

  it("admin without a key may dispatch (app key)", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await world(rig);
    expect((await post(rig, "admin", "p")).status).toBe(200);
  });

  it("per-user rate limit: the 21st enqueue in an hour → 429", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await world(rig);
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await post(rig, "owner", "p");
      statuses.push(res.status);
      // clear the active run so only the rate limit is in play
      await rig.prisma.dispatch.updateMany({ data: { status: "completed" } });
    }
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});
