/** Bughunt 1.0 — milestones GET must re-verify membership (stale active org). */
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

describe("GET /api/milestones", () => {
  it("a removed member with a stale activeOrganizationId sees no org milestones", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    const me = await rig.prisma.user.create({
      data: { id: "me", name: "me", email: "me@x.dev" },
    });
    await rig.prisma.session.create({
      data: { id: "s", token: "tok", userId: me.id, expiresAt: new Date(Date.now() + 3600_000) },
    });
    const org = await createOrg(rig.prisma, { name: "O", ownerId: me.id });
    await rig.prisma.milestone.create({
      data: { organizationId: org.id, title: "Org roadmap", position: 1024 },
    });
    await rig.prisma.session.update({
      where: { token: "tok" },
      data: { activeOrganizationId: org.id },
    });
    // Removed from the org; session still points at it.
    await rig.prisma.member.deleteMany({ where: { userId: me.id } });

    const res = await route.GET(
      new NextRequest("http://x/api/milestones", {
        headers: { cookie: "better-auth.session_token=tok.s" },
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).milestones).toHaveLength(0);
  });
});
