/** 54.1 — admin-only independent-user invites. */
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

async function loadRoute(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return await import("./route");
}

async function makeUser(r: DispatchRig, role: string, token: string) {
  const user = await r.prisma.user.create({
    data: { id: `u-${role}-${token}`, name: role, email: `${token}@x.dev`, role },
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
  return new NextRequest("http://x/api/admin/invites", {
    method,
    headers: token
      ? { cookie: `better-auth.session_token=${token}.sig` }
      : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("/api/admin/invites", () => {
  it("rejects non-admins with 403", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    vi.stubEnv("AUTH_REQUIRED", "true");
    await makeUser(rig, "user", "tok-user");
    const route = await loadRoute(rig);
    const res = await route.POST(req("POST", "tok-user", { email: "a@b.dev" }));
    expect(res.status).toBe(403);
  });

  it("admin creates an invite and lists it", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    vi.stubEnv("AUTH_REQUIRED", "true");
    await makeUser(rig, "admin", "tok-admin");
    const route = await loadRoute(rig);
    const res = await route.POST(
      req("POST", "tok-admin", { email: "New@Invitee.dev" })
    );
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created.invite.email).toBe("new@invitee.dev");
    expect(created.invite.token).toBeTruthy();

    const list = await (await route.GET(req("GET", "tok-admin"))).json();
    expect(list.invites).toHaveLength(1);
  });

  it("rejects a duplicate pending invite for the same email", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    vi.stubEnv("AUTH_REQUIRED", "true");
    await makeUser(rig, "admin", "tok-admin");
    const route = await loadRoute(rig);
    await route.POST(req("POST", "tok-admin", { email: "a@b.dev" }));
    const dup = await route.POST(req("POST", "tok-admin", { email: "A@B.dev" }));
    expect(dup.status).toBe(409);
  });

  it("rejects an invalid email with 400", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    vi.stubEnv("AUTH_REQUIRED", "true");
    await makeUser(rig, "admin", "tok-admin");
    const route = await loadRoute(rig);
    const res = await route.POST(req("POST", "tok-admin", { email: "nope" }));
    expect(res.status).toBe(400);
  });
});
