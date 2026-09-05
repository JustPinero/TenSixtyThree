/** 54.3 — org routes: mine/create, switch, posts, project shares. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { createOrg } from "@/lib/orgs";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
});

async function load(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  const orgs = await import("./route");
  const active = await import("./active/route");
  const posts = await import("./posts/route");
  const projects = await import("./projects/route");
  return { orgs, active, posts, projects };
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

function req(path: string, method: string, token: string | null, body?: unknown) {
  return new NextRequest(`http://x/api/orgs${path}`, {
    method,
    headers: token ? { cookie: `better-auth.session_token=${token}.s` } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("/api/orgs", () => {
  it("401 without a session; create makes me owner; GET lists mine + active", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { orgs, active } = await load(rig);
    expect((await orgs.GET(req("", "GET", null))).status).toBe(401);

    await makeSession(rig, "tok");
    const created = await (
      await orgs.POST(req("", "POST", "tok", { name: "Coqui Labs" }))
    ).json();
    expect(created.org.slug).toBe("coqui-labs");

    await active.PUT(
      req("/active", "PUT", "tok", { organizationId: created.org.id })
    );
    const mine = await (await orgs.GET(req("", "GET", "tok"))).json();
    expect(mine.orgs).toHaveLength(1);
    expect(mine.activeOrganizationId).toBe(created.org.id);
  });

  it("switching to an org I'm not in is 403", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { active } = await load(rig);
    await makeSession(rig, "tok");
    const stranger = await rig.prisma.user.create({
      data: { id: "ux", name: "x", email: "x@x.dev" },
    });
    const other = await createOrg(rig.prisma, {
      name: "Other",
      ownerId: stranger.id,
    });
    const res = await active.PUT(
      req("/active", "PUT", "tok", { organizationId: other.id })
    );
    expect(res.status).toBe(403);
  });
});

describe("/api/orgs/posts", () => {
  async function setup(r: DispatchRig) {
    const user = await makeSession(r, "tok");
    const org = await createOrg(r.prisma, { name: "Org", ownerId: user.id });
    await r.prisma.session.update({
      where: { token: "tok" },
      data: { activeOrganizationId: org.id },
    });
    return { user, org };
  }

  it("member posts a typed entry; bad types 400; sessionless 401", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { posts } = await load(rig);
    expect(
      (await posts.POST(req("/posts", "POST", null, { type: "goal", title: "t" })))
        .status
    ).toBe(401);

    await setup(rig);
    const ok = await posts.POST(
      req("/posts", "POST", "tok", {
        type: "test-request",
        title: "Harden the webhook suite",
        body: "Edge cases around spool replay",
      })
    );
    expect(ok.status).toBe(200);

    const bad = await posts.POST(
      req("/posts", "POST", "tok", { type: "gossip", title: "no" })
    );
    expect(bad.status).toBe(400);

    const list = await (await posts.GET(req("/posts", "GET", "tok"))).json();
    expect(list.posts).toHaveLength(1);
    expect(list.posts[0].type).toBe("test-request");
  });

  it("attaching a project requires it be shared to the org", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { posts, projects } = await load(rig);
    const { user, org } = await setup(rig);
    const project = await rig.prisma.project.create({
      data: { name: "P", slug: "p", path: "/p/p" },
    });

    const unshared = await posts.POST(
      req("/posts", "POST", "tok", {
        type: "bug",
        title: "Crash",
        projectId: project.id,
      })
    );
    expect(unshared.status).toBe(400);

    await projects.POST(
      req("/projects", "POST", "tok", { projectId: project.id })
    );
    const shared = await posts.POST(
      req("/posts", "POST", "tok", {
        type: "bug",
        title: "Crash",
        projectId: project.id,
      })
    );
    expect(shared.status).toBe(200);
    void user;
    void org;
  });
});

describe("/api/orgs/projects", () => {
  it("share, duplicate 409, list, unshare", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { projects } = await load(rig);
    const user = await makeSession(rig, "tok");
    const org = await createOrg(rig.prisma, { name: "Org", ownerId: user.id });
    await rig.prisma.session.update({
      where: { token: "tok" },
      data: { activeOrganizationId: org.id },
    });
    const project = await rig.prisma.project.create({
      data: { name: "P", slug: "p", path: "/p/p" },
    });

    const share = await projects.POST(
      req("/projects", "POST", "tok", { projectId: project.id })
    );
    expect(share.status).toBe(200);
    expect(
      (
        await projects.POST(
          req("/projects", "POST", "tok", { projectId: project.id })
        )
      ).status
    ).toBe(409);

    const list = await (
      await projects.GET(req("/projects", "GET", "tok"))
    ).json();
    expect(list.projects).toHaveLength(1);
    expect(list.projects[0].slug).toBe("p");

    const unshare = await projects.DELETE(
      req("/projects", "DELETE", "tok", { projectId: project.id })
    );
    expect(unshare.status).toBe(200);
    expect(
      (await (await projects.GET(req("/projects", "GET", "tok"))).json())
        .projects
    ).toHaveLength(0);
  });
});
