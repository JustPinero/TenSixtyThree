/**
 * Phase 48.3 — invite creation + acceptance over HTTP.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { createTeam } from "@/lib/teams";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
});

async function scaffold(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  const owner = await r.prisma.user.create({
    data: { email: "op@local", name: "Op" },
  });
  const team = await createTeam(r.prisma, { name: "Fleet", owner });
  return { owner, team, route: await import("./route") };
}

describe("/api/team/invite", () => {
  it("POST creates an invite and returns its token", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { route } = await scaffold(rig);
    const res = await route.POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ email: "maya@x.com", role: "member" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invite.token).toBeTruthy();
  });

  it("PUT accepts a valid token and creates the membership", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { route, team } = await scaffold(rig);
    const created = await (
      await route.POST(
        new Request("http://x", {
          method: "POST",
          body: JSON.stringify({ email: "maya@x.com" }),
        }),
      )
    ).json();
    const res = await route.PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ token: created.invite.token, name: "Maya" }),
      }),
    );
    expect(res.status).toBe(200);
    const memberships = await rig.prisma.membership.findMany({
      where: { teamId: team.id },
    });
    expect(memberships.length).toBe(2); // owner + maya
  });

  it("PUT rejects a bogus token", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { route } = await scaffold(rig);
    const res = await route.PUT(
      new Request("http://x", {
        method: "PUT",
        body: JSON.stringify({ token: "nope", name: "X" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
