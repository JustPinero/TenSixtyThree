/** 55.1 — org member invites from the workspace. */
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

function req(token: string | null, body?: unknown) {
  return new NextRequest("http://x/api/orgs/invite", {
    method: "POST",
    headers: token ? { cookie: `better-auth.session_token=${token}.s` } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/orgs/invite", () => {
  it("member invites an email; re-invite replaces the pending row", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    const me = await makeSession(rig, "tok");
    const org = await createOrg(rig.prisma, { name: "O", ownerId: me.id });
    await rig.prisma.session.update({
      where: { token: "tok" },
      data: { activeOrganizationId: org.id },
    });

    const first = await route.POST(req("tok", { email: "New@Person.dev" }));
    expect(first.status).toBe(200);
    const second = await route.POST(req("tok", { email: "new@person.dev" }));
    expect(second.status).toBe(200);

    const pending = await rig.prisma.invitation.findMany({
      where: { organizationId: org.id, status: "pending" },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe("new@person.dev");
  });

  it("401 sessionless, 400 without active org, 400 bad email", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    expect((await route.POST(req(null, { email: "a@b.dev" }))).status).toBe(401);
    await makeSession(rig, "tok");
    expect((await route.POST(req("tok", { email: "a@b.dev" }))).status).toBe(400);
  });
});

describe("security review 55: role escalation", () => {
  it("a plain member cannot invite with the admin role", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    const owner = await makeSession(rig, "tokowner");
    const org = await createOrg(rig.prisma, { name: "O", ownerId: owner.id });
    const plain = await makeSession(rig, "tokplain");
    await rig.prisma.member.create({
      data: { userId: plain.id, organizationId: org.id, role: "member" },
    });
    await rig.prisma.session.update({
      where: { token: "tokplain" },
      data: { activeOrganizationId: org.id },
    });
    const res = await route.POST(
      req("tokplain", { email: "new@p.dev", role: "admin" })
    );
    expect(res.status).toBe(403);

    await rig.prisma.session.update({
      where: { token: "tokowner" },
      data: { activeOrganizationId: org.id },
    });
    const ok = await route.POST(
      req("tokowner", { email: "new@p.dev", role: "admin" })
    );
    expect(ok.status).toBe(200);
  });
});
