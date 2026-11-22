/**
 * Phase 66.3 — the Overseer model is a per-user preference over an
 * admin-set default. One user's choice never changes another's.
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

import { GET, PATCH } from "./route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  seedTenants,
  requestAs,
  type TenantUser,
} from "@/tests/harness/tenants";
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  resolveChatModel,
} from "@/lib/model-config";

let rig: DispatchRig | null = null;
const [A, B] = CHAT_MODEL_OPTIONS.map((o) => o.id).filter(
  (id) => id !== DEFAULT_CHAT_MODEL,
);

beforeEach(async () => {
  process.env.AUTH_REQUIRED = "true";
  delete process.env.CASCADE_CHAT_MODEL;
  rig = await createDispatchRig({ fakeTimers: false });
  (globalThis as Record<string, unknown>).__rigPrisma = rig.prisma;
  await seedTenants(rig.prisma);
});

afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  delete (globalThis as Record<string, unknown>).__rigPrisma;
  await rig?.dispose();
  rig = null;
});

async function modelOf(user: TenantUser): Promise<string> {
  const res = await GET(requestAs(user, "http://x/api/settings/model"));
  expect(res.status).toBe(200);
  return ((await res.json()) as { model: string }).model;
}

function patch(user: TenantUser, body: Record<string, unknown>) {
  return PATCH(
    requestAs(user, "http://x/api/settings/model", { method: "PATCH", body }),
  );
}

describe("66.3 — per-user chat model", () => {
  it("needs at least two non-default options to be meaningful", () => {
    expect(A).toBeDefined();
    expect(B).toBeDefined();
  });

  it("a user's choice is theirs alone", async () => {
    expect((await patch("alice", { model: A })).status).toBe(200);
    expect(await modelOf("alice")).toBe(A);
    expect(await modelOf("bob")).toBe(DEFAULT_CHAT_MODEL);
    expect(await resolveChatModel(rig!.prisma, "alice")).toBe(A);
    expect(await resolveChatModel(rig!.prisma, "bob")).toBe(DEFAULT_CHAT_MODEL);
  });

  it("the admin default applies to users without a preference", async () => {
    expect((await patch("admin", { model: B, scope: "default" })).status).toBe(
      200,
    );
    await patch("alice", { model: A });
    expect(await modelOf("bob")).toBe(B);
    expect(await modelOf("alice")).toBe(A);
  });

  it("only an admin can set the default", async () => {
    expect((await patch("alice", { model: B, scope: "default" })).status).toBe(
      403,
    );
    expect(await modelOf("bob")).toBe(DEFAULT_CHAT_MODEL);
  });

  it("clearing a preference falls back to the default", async () => {
    await patch("alice", { model: A });
    await patch("alice", { model: null });
    expect(await modelOf("alice")).toBe(DEFAULT_CHAT_MODEL);
  });

  it("demo visitors cannot change it; service stays admin-only", async () => {
    expect((await patch("demo1", { model: A })).status).toBe(403);
    expect((await patch("alice", { service: "claude" })).status).toBe(403);
  });

  it("GET tells the client whether it may set the default", async () => {
    const asAdmin = await GET(
      requestAs("admin", "http://x/api/settings/model"),
    );
    expect(await asAdmin.json()).toMatchObject({ canSetDefault: true });
    const asAlice = await GET(
      requestAs("alice", "http://x/api/settings/model"),
    );
    expect(await asAlice.json()).toMatchObject({ canSetDefault: false });
  });
});
