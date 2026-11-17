/**
 * Phase 64.1/64.2 — deny-by-default access helpers.
 *
 * "local" is a property of configuration (AUTH_REQUIRED unset), never of a
 * missing session. Under AUTH_REQUIRED a null or unknown cookie is a 401.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
const ORIGINAL = process.env.AUTH_REQUIRED;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  if (ORIGINAL === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = ORIGINAL;
  vi.resetModules();
});

async function load(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return import("./access");
}

async function user(
  r: DispatchRig,
  token: string,
  opts: { role?: string; isDemo?: boolean } = {},
) {
  await r.prisma.user.create({
    data: {
      id: `u-${token}`,
      name: token,
      email: `${token}@x.dev`,
      role: opts.role ?? "user",
      isDemo: opts.isDemo ?? false,
    },
  });
  await r.prisma.session.create({
    data: {
      id: `s-${token}`,
      token,
      userId: `u-${token}`,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
}

function req(token: string | null) {
  return new NextRequest("http://x/api/anything", {
    headers: token ? { cookie: `better-auth.session_token=${token}.sig` } : {},
  });
}

describe("requireUser", () => {
  it("hosted: no cookie → 401", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const { requireUser } = await load(rig);
    const gate = await requireUser(req(null));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it("hosted: a made-up cookie → 401 (the live 11-16 hole)", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const { requireUser } = await load(rig);
    const gate = await requireUser(req("x"));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it("hosted: real session → user viewer with flags", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    await user(rig, "adm", { role: "admin" });
    const { requireUser } = await load(rig);
    const gate = await requireUser(req("adm"));
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.viewer.kind).toBe("user");
      if (gate.viewer.kind === "user") {
        expect(gate.viewer.isAdmin).toBe(true);
        expect(gate.viewer.isDemo).toBe(false);
        expect(gate.viewer.userId).toBe("u-adm");
      }
    }
  });

  it("local: no cookie → local operator", async () => {
    delete process.env.AUTH_REQUIRED;
    rig = await createDispatchRig({ fakeTimers: false });
    const { requireUser } = await load(rig);
    const gate = await requireUser(req(null));
    expect(gate.ok && gate.viewer.kind).toBe("local");
  });
});

describe("requireSignedIn", () => {
  it("needs a real account even in local mode", async () => {
    delete process.env.AUTH_REQUIRED;
    rig = await createDispatchRig({ fakeTimers: false });
    const { requireSignedIn } = await load(rig);
    const gate = await requireSignedIn(req(null));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });
});

describe("requireAdmin", () => {
  it("hosted: plain user → 403, admin → ok, local → ok", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    await user(rig, "plain");
    await user(rig, "boss", { role: "admin" });
    const { requireAdmin } = await load(rig);
    const plain = await requireAdmin(req("plain"));
    expect(!plain.ok && plain.response.status).toBe(403);
    expect((await requireAdmin(req("boss"))).ok).toBe(true);
    delete process.env.AUTH_REQUIRED;
    expect((await requireAdmin(req(null))).ok).toBe(true);
  });
});

describe("requireNonDemo", () => {
  it("demo session → 403; regular user → ok", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    await user(rig, "demo", { isDemo: true });
    await user(rig, "real");
    const { requireNonDemo } = await load(rig);
    const demo = await requireNonDemo(req("demo"));
    expect(!demo.ok && demo.response.status).toBe(403);
    expect((await requireNonDemo(req("real"))).ok).toBe(true);
  });
});

describe("requireLocalMode", () => {
  it("hosted → 403 hostedUnsupported even for an admin", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    await user(rig, "boss", { role: "admin" });
    const { requireLocalMode } = await load(rig);
    const gate = await requireLocalMode(req("boss"));
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.response.status).toBe(403);
      expect(await gate.response.json()).toMatchObject({
        hostedUnsupported: true,
      });
    }
  });

  it("local → ok", async () => {
    delete process.env.AUTH_REQUIRED;
    rig = await createDispatchRig({ fakeTimers: false });
    const { requireLocalMode } = await load(rig);
    expect((await requireLocalMode(req(null))).ok).toBe(true);
  });
});

describe("jsonError (64.5)", () => {
  it("hosted: never echoes the raw error message", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const { jsonError } = await load(rig);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = jsonError(
      new Error("Unique constraint failed on the fields: (`Project.slug`)"),
      "projects.list",
    );
    spy.mockRestore();
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/constraint|Project\.slug/);
  });
});
