/**
 * Phase 48.3 — Teams minimal UI wiring: the /api/team surface.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
});

async function loadRoute(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return await import("./route");
}

describe("/api/team", () => {
  it("GET returns team:null when no team exists", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { GET } = await loadRoute(rig);
    const body = await (await GET()).json();
    expect(body.team).toBeNull();
  });

  it("POST creates a team with the local operator as owner", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { POST, GET } = await loadRoute(rig);
    const res = await POST(
      new Request("http://x/api/team", {
        method: "POST",
        body: JSON.stringify({
          name: "Coquí Labs",
          operatorEmail: "justin@coquilabs.ai",
          operatorName: "Justin",
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await (await GET()).json();
    expect(body.team.name).toBe("Coquí Labs");
    expect(body.members.length).toBe(1);
    expect(body.members[0].role).toBe("owner");
  });

  it("GET includes the unified activity feed for the team", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { POST, GET } = await loadRoute(rig);
    await POST(
      new Request("http://x/api/team", {
        method: "POST",
        body: JSON.stringify({
          name: "Fleet",
          operatorEmail: "op@local",
          operatorName: "Operator",
        }),
      }),
    );
    // seed one team-attributed task via the domain services
    const { createTeam: _ct, ...teams } = await import("@/lib/teams");
    void _ct;
    void teams;
    const team = await rig.prisma.team.findFirstOrThrow();
    const t = await rig.prisma.humanTask.create({
      data: { title: "review PR", status: "pending", teamId: team.id },
    });
    void t;
    const body = await (await GET()).json();
    expect(Array.isArray(body.activity)).toBe(true);
    expect(body.activity.length).toBe(1);
    expect(body.activity[0].title).toBe("review PR");
  });
});
