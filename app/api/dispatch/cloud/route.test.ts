/** 52.1 — hosted users enqueue cloud dispatches. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
});

async function load(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return await import("./route");
}

async function makeSession(r: DispatchRig, token: string, isDemo = false) {
  const user = await r.prisma.user.create({
    data: {
      id: `u-${token}`,
      name: token,
      email: isDemo ? `${token}@demo.tensixtythree.local` : `${token}@x.dev`,
      isDemo,
    },
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

function req(token: string | null, body: unknown) {
  return new NextRequest("http://x/api/dispatch/cloud", {
    method: "POST",
    headers: token ? { cookie: `better-auth.session_token=${token}.s` } : {},
    body: JSON.stringify(body),
  });
}

describe("POST /api/dispatch/cloud", () => {
  it("enqueues a cloud dispatch for a visible project with a repo", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    const me = await makeSession(rig, "tok");
    const project = await rig.prisma.project.create({
      data: {
        name: "P",
        slug: "p",
        path: "/p/p",
        githubRepo: "just/p",
        ownerUserId: me.id,
      },
    });
    const res = await route.POST(req("tok", { slug: "p", mode: "audit" }));
    expect(res.status).toBe(200);
    const { dispatch } = await res.json();
    expect(dispatch.runtime).toBe("cloud");
    expect(dispatch.status).toBe("queued");
    expect(dispatch.ownerUserId).toBe(me.id);
    void project;
  });

  it("401 sessionless; 404 invisible project; 400 repo-less; 403 demo", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    expect((await route.POST(req(null, { slug: "p" }))).status).toBe(401);

    const owner = await rig.prisma.user.create({
      data: { id: "o", name: "o", email: "o@x.dev" },
    });
    await rig.prisma.project.create({
      data: {
        name: "Hidden",
        slug: "hidden",
        path: "/p/h",
        githubRepo: "just/h",
        ownerUserId: owner.id,
      },
    });
    await makeSession(rig, "tok");
    expect((await route.POST(req("tok", { slug: "hidden" }))).status).toBe(404);

    await rig.prisma.project.create({
      data: { name: "NoRepo", slug: "norepo", path: "/p/n", ownerUserId: "u-tok" },
    });
    expect((await route.POST(req("tok", { slug: "norepo" }))).status).toBe(400);

    await makeSession(rig, "tokd", true);
    expect((await route.POST(req("tokd", { slug: "p" }))).status).toBe(403);
  });
});

describe("autonomy posture (52.8)", () => {
  it("refuses to cloud-dispatch a manual-autonomy project", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    const me = await makeSession(rig, "tok");
    await rig.prisma.project.create({
      data: {
        name: "M",
        slug: "manual-proj",
        path: "/p/m",
        githubRepo: "j/m",
        autonomyMode: "manual",
        ownerUserId: me.id,
      },
    });
    const res = await route.POST(req("tok", { slug: "manual-proj" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/manual/i);
  });
});
