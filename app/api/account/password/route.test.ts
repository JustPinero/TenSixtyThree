/** 54.1 — password-after-first-login surface. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
const setPassword = vi.fn().mockResolvedValue({ status: true });

afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
  vi.unstubAllEnvs();
  setPassword.mockClear();
});

async function loadRoute(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  vi.doMock("@/lib/auth", () => ({ auth: { api: { setPassword } } }));
  return await import("./route");
}

async function makeSession(r: DispatchRig, token: string, withCredential = false) {
  const user = await r.prisma.user.create({
    data: { id: `u-${token}`, name: "t", email: `${token}@x.dev` },
  });
  await r.prisma.session.create({
    data: {
      id: `s-${token}`,
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  if (withCredential) {
    await r.prisma.account.create({
      data: {
        id: `a-${token}`,
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: "hashed",
      },
    });
  }
  return user;
}

function req(method: string, token: string | null, body?: unknown) {
  return new NextRequest("http://x/api/account/password", {
    method,
    headers: token ? { cookie: `better-auth.session_token=${token}.s` } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("GET /api/account/password (has-password)", () => {
  it("401 without a session", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await loadRoute(rig);
    expect((await route.GET(req("GET", null))).status).toBe(401);
  });

  it("reports false before setPassword, true after a credential account exists", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeSession(rig, "tok-a", false);
    await makeSession(rig, "tok-b", true);
    const route = await loadRoute(rig);
    expect((await (await route.GET(req("GET", "tok-a"))).json()).hasPassword).toBe(false);
    expect((await (await route.GET(req("GET", "tok-b"))).json()).hasPassword).toBe(true);
  });
});

describe("POST /api/account/password (set)", () => {
  it("401 without a session", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await loadRoute(rig);
    expect(
      (await route.POST(req("POST", null, { newPassword: "longenough1" })))
        .status
    ).toBe(401);
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("400 on a too-short password, without calling Better Auth", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeSession(rig, "tok-a");
    const route = await loadRoute(rig);
    expect(
      (await route.POST(req("POST", "tok-a", { newPassword: "short" }))).status
    ).toBe(400);
    expect(setPassword).not.toHaveBeenCalled();
  });

  it("delegates a valid set to auth.api.setPassword with the request headers", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeSession(rig, "tok-a");
    const route = await loadRoute(rig);
    const res = await route.POST(
      req("POST", "tok-a", { newPassword: "longenough1" })
    );
    expect(res.status).toBe(200);
    expect(setPassword).toHaveBeenCalledOnce();
    const call = setPassword.mock.calls[0][0];
    expect(call.body.newPassword).toBe("longenough1");
    expect(call.headers).toBeDefined();
  });
});
