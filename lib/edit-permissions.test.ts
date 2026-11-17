/**
 * Phase 65.4/65.5 — seeing is not acting, and Stop hooks speak only for
 * local dispatches.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
const saved = { ...process.env };
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  process.env = { ...saved };
  vi.resetModules();
});

async function world(r: DispatchRig) {
  for (const [id, role] of [["owner", "user"], ["member", "user"]] as const) {
    await r.prisma.user.create({ data: { id, name: id, email: `${id}@x.dev`, role } });
    await r.prisma.session.create({
      data: { id: `s-${id}`, token: id, userId: id, activeOrganizationId: "org", expiresAt: new Date(Date.now() + 3600_000) },
    });
  }
  for (const id of ["org", "other"]) {
    await r.prisma.organization.create({ data: { id, name: id, slug: id, createdAt: new Date() } });
  }
  await r.prisma.member.create({ data: { userId: "owner", organizationId: "org", role: "owner", createdAt: new Date() } });
  await r.prisma.member.create({ data: { userId: "member", organizationId: "org", role: "member", createdAt: new Date() } });
  await r.prisma.member.create({ data: { userId: "member", organizationId: "other", role: "owner", createdAt: new Date() } });
  const p = await r.prisma.project.create({
    data: { name: "P", slug: "p", path: "/p/p", ownerUserId: "owner", autonomyMode: "semi" },
  });
  await r.prisma.orgProjectShare.create({ data: { organizationId: "org", projectId: p.id, sharedById: "owner" } });
  return p;
}

function req(url: string, method: string, token: string, body: unknown) {
  return new NextRequest(`http://x${url}`, {
    method,
    headers: { cookie: `better-auth.session_token=${token}.s`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/projects/[slug]", () => {
  it("a plain org member cannot flip autonomyMode; the owner can", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    await world(r);
    vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
    const { PATCH } = await import("@/app/api/projects/[slug]/route");
    const ctx = { params: Promise.resolve({ slug: "p" }) };
    const denied = await PATCH(req("/api/projects/p", "PATCH", "member", { autonomyMode: "full" }), ctx);
    expect(denied.status).toBe(403);
    expect((await r.prisma.project.findUnique({ where: { slug: "p" } }))?.autonomyMode).toBe("semi");
    const ok = await PATCH(req("/api/projects/p", "PATCH", "owner", { autonomyMode: "full" }), {
      params: Promise.resolve({ slug: "p" }),
    });
    expect(ok.status).toBe(200);
  });
});

describe("POST /api/orgs/projects (S7)", () => {
  it("a plain member cannot re-share a project into another org they own", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    const p = await world(r);
    await r.prisma.session.update({ where: { token: "member" }, data: { activeOrganizationId: "other" } });
    vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
    const { POST } = await import("@/app/api/orgs/projects/route");
    const res = await POST(req("/api/orgs/projects", "POST", "member", { projectId: p.id }));
    // invisible from "other"'s perspective? No — member sees it via "org".
    expect(res.status).toBe(403);
    expect(await r.prisma.orgProjectShare.count({ where: { organizationId: "other" } })).toBe(0);
  });
});

describe("webhook (65.5)", () => {
  it("hosted: refused outright", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
    const { POST } = await import("@/app/api/webhook/session-complete/route");
    const res = await POST(
      new NextRequest("http://x/api/webhook/session-complete", {
        method: "POST",
        body: JSON.stringify({ projectPath: "/p/p" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("local: an idempotency key belonging to a CLOUD dispatch never completes it", async () => {
    delete process.env.AUTH_REQUIRED;
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    const p = await r.prisma.project.create({ data: { name: "P", slug: "p", path: "/p/p" } });
    const cloud = await r.prisma.dispatch.create({
      data: { projectId: p.id, projectSlug: "p", mode: "continue", runtime: "cloud", status: "started" },
    });
    const { ingestSessionComplete } = await import("./webhook-ingest");
    await ingestSessionComplete(r.prisma, {
      projectPath: "/p/p",
      idempotencyKey: cloud.idempotencyKey,
    });
    const row = await r.prisma.dispatch.findUnique({ where: { id: cloud.id } });
    expect(row?.status).toBe("started");
  });
});

describe("sharing is the owner's call (review 3/4)", () => {
  it("an org ADMIN of a shared org still cannot re-share into another org", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    const p = await world(r);
    await r.prisma.member.updateMany({ where: { userId: "member", organizationId: "org" }, data: { role: "admin" } });
    await r.prisma.session.update({ where: { token: "member" }, data: { activeOrganizationId: "other" } });
    vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
    const { POST } = await import("@/app/api/orgs/projects/route");
    const res = await POST(req("/api/orgs/projects", "POST", "member", { projectId: p.id }));
    expect(res.status).toBe(403);
  });

  it("an admin of some OTHER org cannot unshare from this org", async () => {
    process.env.AUTH_REQUIRED = "true";
    rig = await createDispatchRig({ fakeTimers: false });
    const r = rig;
    const p = await world(r);
    // member is a plain member of "org" (owner of "other"); acting in "org"
    vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
    const { DELETE } = await import("@/app/api/orgs/projects/route");
    const res = await DELETE(req("/api/orgs/projects", "DELETE", "member", { projectId: p.id }));
    expect(res.status).toBe(403);
    expect(await r.prisma.orgProjectShare.count({ where: { organizationId: "org" } })).toBe(1);
  });
});
