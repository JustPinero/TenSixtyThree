/**
 * Phase 64.4 — demo sessions are read-mostly.
 *
 * A demo visitor can explore the sandbox (boards, tickets, feed posts in
 * their own demo org) but cannot create orgs, invite people (that was an
 * invite-only bypass AND an email relay from our domain), share projects,
 * store keys, change settings, or spend model money on a briefing.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { clearRateLimits } from "./rate-limiter";

let rig: DispatchRig | null = null;
const ORIGINAL = process.env.AUTH_REQUIRED;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  if (ORIGINAL === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = ORIGINAL;
  vi.unstubAllGlobals();
  vi.resetModules();
  clearRateLimits();
});

async function demoUser(r: DispatchRig) {
  const user = await r.prisma.user.create({
    data: {
      id: "u-demo",
      name: "Demo",
      email: "d@demo.tensixtythree.local",
      isDemo: true,
    },
  });
  const org = await r.prisma.organization.create({
    data: {
      id: "o-demo",
      name: "Demo org",
      slug: "demo-org",
      isDemo: true,
      createdAt: new Date(),
    },
  });
  await r.prisma.member.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: "owner",
      createdAt: new Date(),
    },
  });
  await r.prisma.session.create({
    data: {
      id: "s-demo",
      token: "demo",
      userId: user.id,
      activeOrganizationId: org.id,
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });
}

function req(url: string, method: string, body: unknown = {}) {
  return new NextRequest(`http://x${url}`, {
    method,
    headers: {
      cookie: "better-auth.session_token=demo.sig",
      "content-type": "application/json",
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

type Handler = (r: NextRequest) => Promise<Response>;

describe("demo session writes", () => {
  const cases: [string, string, string, unknown][] = [
    ["app/api/orgs/route", "POST", "/api/orgs", { name: "Real org" }],
    [
      "app/api/orgs/invite/route",
      "POST",
      "/api/orgs/invite",
      { email: "victim@example.com" },
    ],
    [
      "app/api/orgs/projects/route",
      "POST",
      "/api/orgs/projects",
      { projectId: 1 },
    ],
    [
      "app/api/orgs/projects/route",
      "DELETE",
      "/api/orgs/projects",
      { projectId: 1 },
    ],
    [
      "app/api/orgs/linear/route",
      "PUT",
      "/api/orgs/linear",
      { key: "lin_api_xxxxxxxxxxxxxxxxxxxx" },
    ],
    ["app/api/orgs/linear/route", "POST", "/api/orgs/linear", { boardId: "b" }],
    [
      "app/api/account/password/route",
      "POST",
      "/api/account/password",
      { password: "x".repeat(12) },
    ],
    [
      "app/api/account/anthropic-key/route",
      "PUT",
      "/api/account/anthropic-key",
      { key: "sk-ant-" + "x".repeat(20) },
    ],
    [
      "app/api/settings/model/route",
      "PATCH",
      "/api/settings/model",
      { model: "x" },
    ],
    ["app/api/tasks/route", "POST", "/api/tasks", { title: "t" }],
    ["app/api/reminders/route", "POST", "/api/reminders", { message: "m" }],
    ["app/api/overseer/history/route", "DELETE", "/api/overseer/history", {}],
  ];
  for (const [mod, method, url, body] of cases) {
    it(`${method} ${url} → 403`, async () => {
      process.env.AUTH_REQUIRED = "true";
      rig = await createDispatchRig({ fakeTimers: false });
      const r = rig;
      vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
      await demoUser(r);
      const sendEmail = vi.fn();
      vi.doMock("@/lib/email", async (orig) => ({
        ...(await orig<typeof import("@/lib/email")>()),
        sendEmail,
      }));
      const route = (await import(`@/${mod}`)) as Record<string, Handler>;
      const res = await route[method](req(url, method, body));
      expect(res.status).toBe(403);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(await r.prisma.invitation.count()).toBe(0);
    });
  }
});

describe("demo briefing", () => {
  it("is canned — no model call, no fleet data", async () => {
    process.env.AUTH_REQUIRED = "true";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
    await demoUser(r);
    await r.prisma.project.create({
      data: { name: "Operator secret", slug: "op", path: "/p/op" },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("@/app/api/briefing/route");
    const res = await POST(req("/api/briefing", "POST"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.briefing).toBe("string");
    expect(JSON.stringify(body)).not.toContain("Operator secret");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("76 — the demo assistant answers the question asked", () => {
  async function sseText(res: Response): Promise<string> {
    const raw = await res.text();
    return raw
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)) as { delta?: { text?: string } })
      .map((e) => e.delta?.text ?? "")
      .join("");
  }

  it("Overseer chat: a Meridian question gets the Meridian reply, no model call", async () => {
    process.env.AUTH_REQUIRED = "true";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
    await demoUser(r);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("@/app/api/overseer/chat/route");
    const res = await POST(
      req("/api/overseer/chat", "POST", {
        messages: [{ role: "user", content: "How is Meridian doing?" }],
      }),
    );
    expect(res.status).toBe(200);
    const { DEMO_REPLIES } = await import("@/lib/demo-overseer");
    expect(await sseText(res)).toBe(DEMO_REPLIES.meridian);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("project chat: scripted about a visible demo project; 404 for anyone else's", async () => {
    process.env.AUTH_REQUIRED = "true";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
    await demoUser(r);
    const atlas = await r.prisma.project.create({
      data: { name: "Atlas API", slug: "demo-atlas-x", path: "/demo/a", isDemo: true },
    });
    await r.prisma.orgProjectShare.create({
      data: { organizationId: "o-demo", projectId: atlas.id, sharedById: "u-demo" },
    });
    await r.prisma.project.create({
      data: { name: "Operator secret", slug: "op", path: "/p/op" },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { POST } = await import("@/app/api/projects/[slug]/chat/route");
    const body = { messages: [{ role: "user", content: "what's next?" }] };
    const ok = await POST(req("/api/projects/demo-atlas-x/chat", "POST", body), {
      params: Promise.resolve({ slug: "demo-atlas-x" }),
    });
    expect(ok.status).toBe(200);
    expect(await sseText(ok)).toMatch(/Atlas API/);
    const hidden = await POST(req("/api/projects/op/chat", "POST", body), {
      params: Promise.resolve({ slug: "op" }),
    });
    expect(hidden.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("org invites are rate-limited per user", () => {
  it("the 11th invite in an hour is refused", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
    vi.doMock("@/lib/email", async (orig) => ({
      ...(await orig<typeof import("@/lib/email")>()),
      sendEmail: vi.fn(),
    }));
    await r.prisma.user.create({
      data: { id: "u-owner", name: "O", email: "o@x.dev" },
    });
    await r.prisma.organization.create({
      data: { id: "o1", name: "Org", slug: "org", createdAt: new Date() },
    });
    await r.prisma.member.create({
      data: {
        userId: "u-owner",
        organizationId: "o1",
        role: "owner",
        createdAt: new Date(),
      },
    });
    await r.prisma.session.create({
      data: {
        id: "s-o",
        token: "owner",
        userId: "u-owner",
        activeOrganizationId: "o1",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const { POST } = await import("@/app/api/orgs/invite/route");
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await POST(
        new NextRequest("http://x/api/orgs/invite", {
          method: "POST",
          headers: {
            cookie: "better-auth.session_token=owner.sig",
            "content-type": "application/json",
          },
          body: JSON.stringify({ email: `p${i}@example.com` }),
        }),
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
