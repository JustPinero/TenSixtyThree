/** 52.3 — cloud run detail: dispatch + outcome + event stream. */
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

async function makeSession(r: DispatchRig, token: string) {
  const user = await r.prisma.user.create({
    data: { id: `u-${token}`, name: token, email: `${token}@x.dev` },
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

function req(token: string | null, id: string) {
  return new NextRequest(`http://x/api/dispatch/cloud/${id}`, {
    headers: token ? { cookie: `better-auth.session_token=${token}.s` } : {},
  });
}

describe("GET /api/dispatch/cloud/[id]", () => {
  it("returns dispatch + outcome + its events for a visible project", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    const me = await makeSession(rig, "tok");
    const project = await rig.prisma.project.create({
      data: {
        name: "P",
        slug: "p",
        path: "/p/p",
        githubRepo: "j/p",
        ownerUserId: me.id,
      },
    });
    const dispatch = await rig.prisma.dispatch.create({
      data: {
        projectId: project.id,
        projectSlug: "p",
        mode: "audit",
        runtime: "cloud",
        status: "completed",
        costUsd: 0.5,
      },
    });
    await rig.prisma.activityEvent.createMany({
      data: [
        {
          projectId: project.id,
          eventType: "session-complete",
          summary: "[cloud audit] Reading files",
          details: JSON.stringify({ dispatchId: dispatch.id }),
        },
        {
          projectId: project.id,
          eventType: "session-complete",
          summary: "unrelated",
          details: JSON.stringify({ dispatchId: "other" }),
        },
      ],
    });
    await rig.prisma.dispatchOutcome.create({
      data: {
        projectId: project.id,
        projectSlug: "p",
        mode: "audit",
        healthAtDispatch: "idle",
        outcome: "success",
        dispatchedAt: new Date(),
        dispatchId: dispatch.id,
      },
    });

    const res = await route.GET(req("tok", dispatch.id), {
      params: Promise.resolve({ id: dispatch.id }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.dispatch.costUsd).toBe(0.5);
    expect(data.outcome.outcome).toBe("success");
    expect(data.events).toHaveLength(1);
    expect(data.events[0].summary).toContain("Reading files");
  });

  it("401 sessionless; 404 for strangers and unknown ids", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    expect(
      (
        await route.GET(req(null, "x"), { params: Promise.resolve({ id: "x" }) })
      ).status
    ).toBe(401);

    const owner = await rig.prisma.user.create({
      data: { id: "own", name: "o", email: "o@x.dev" },
    });
    const project = await rig.prisma.project.create({
      data: {
        name: "H",
        slug: "h",
        path: "/p/h",
        githubRepo: "j/h",
        ownerUserId: owner.id,
      },
    });
    const dispatch = await rig.prisma.dispatch.create({
      data: {
        projectId: project.id,
        projectSlug: "h",
        mode: "audit",
        runtime: "cloud",
        status: "queued",
      },
    });
    await makeSession(rig, "tok");
    expect(
      (
        await route.GET(req("tok", dispatch.id), {
          params: Promise.resolve({ id: dispatch.id }),
        })
      ).status
    ).toBe(404);
    expect(
      (
        await route.GET(req("tok", "nope"), {
          params: Promise.resolve({ id: "nope" }),
        })
      ).status
    ).toBe(404);
  });
});
