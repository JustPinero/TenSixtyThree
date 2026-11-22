/** Phase 68.3 — who am I (account menu), and a demo exit that really ends the session. */
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

import { GET as whoAmI } from "./route";
import { DELETE as exitDemo } from "../demo/route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { seedTenants, requestAs } from "@/tests/harness/tenants";

let rig: DispatchRig | null = null;

beforeEach(async () => {
  process.env.AUTH_REQUIRED = "true";
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

describe("GET /api/account", () => {
  it("returns the signed-in user's identity and account state", async () => {
    const res = await whoAmI(requestAs("alice", "http://x/api/account"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      user: {
        id: "alice",
        name: "alice",
        email: "alice@tenants.test",
        role: "user",
        isDemo: false,
      },
      hasPassword: false,
      hasAnthropicKey: false,
    });
  });

  it("flags demo sessions", async () => {
    const res = await whoAmI(requestAs("demo1", "http://x/api/account"));
    expect(
      ((await res.json()) as { user: { isDemo: boolean } }).user.isDemo,
    ).toBe(true);
  });

  it("anonymous is a 401", async () => {
    expect((await whoAmI(requestAs(null, "http://x/api/account"))).status).toBe(
      401,
    );
  });
});

describe("DELETE /api/demo (Exit demo)", () => {
  it("ends the demo session server-side and clears the cookie", async () => {
    const res = await exitDemo(
      requestAs("demo1", "http://x/api/demo", { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    expect(
      await rig!.prisma.session.findUnique({ where: { token: "tok-demo1" } }),
    ).toBeNull();
    expect(res.headers.get("set-cookie") ?? "").toMatch(
      /session_token=;|Max-Age=0/i,
    );
  });

  it("never ends a real account's session", async () => {
    await exitDemo(
      requestAs("alice", "http://x/api/demo", { method: "DELETE" }),
    );
    expect(
      await rig!.prisma.session.findUnique({ where: { token: "tok-alice" } }),
    ).not.toBeNull();
  });
});
