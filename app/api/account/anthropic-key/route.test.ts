/** 54.2 — BYOK key management surface. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
});
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
  vi.unstubAllEnvs();
});

async function loadRoute(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return await import("./route");
}

async function makeSession(r: DispatchRig, token: string) {
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
  return user;
}

function req(method: string, token: string | null, body?: unknown) {
  return new NextRequest("http://x/api/account/anthropic-key", {
    method,
    headers: token ? { cookie: `better-auth.session_token=${token}.s` } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("/api/account/anthropic-key", () => {
  it("401s all methods without a session", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await loadRoute(rig);
    expect((await route.GET(req("GET", null))).status).toBe(401);
    expect(
      (await route.PUT(req("PUT", null, { key: "sk-ant-x" }))).status
    ).toBe(401);
    expect((await route.DELETE(req("DELETE", null))).status).toBe(401);
  });

  it("stores the key ENCRYPTED, reports hasKey, and clears on DELETE", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const user = await makeSession(rig, "tok");
    const route = await loadRoute(rig);

    expect(
      (await (await route.GET(req("GET", "tok"))).json()).hasKey
    ).toBe(false);

    const put = await route.PUT(
      req("PUT", "tok", { key: "sk-ant-api03-verysecret" })
    );
    expect(put.status).toBe(200);

    const row = await rig.prisma.user.findUnique({ where: { id: user.id } });
    expect(row?.anthropicKeyEnc).toBeTruthy();
    expect(row?.anthropicKeyEnc).not.toContain("verysecret");

    expect((await (await route.GET(req("GET", "tok"))).json()).hasKey).toBe(
      true
    );

    expect((await route.DELETE(req("DELETE", "tok"))).status).toBe(200);
    const cleared = await rig.prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(cleared?.anthropicKeyEnc).toBeNull();
  });

  it("rejects keys that do not look like Anthropic keys", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await makeSession(rig, "tok");
    const route = await loadRoute(rig);
    expect(
      (await route.PUT(req("PUT", "tok", { key: "hunter2" }))).status
    ).toBe(400);
  });
});
