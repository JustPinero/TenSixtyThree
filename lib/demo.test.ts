/** 54.5 — demo sandbox core. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { isDemoEmail, seedDemo, cleanupDemo } from "./demo";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

describe("isDemoEmail", () => {
  it("recognizes only the demo domain", () => {
    expect(isDemoEmail("demo-abc123@demo.tensixtythree.local")).toBe(true);
    expect(isDemoEmail("justin@gmail.com")).toBe(false);
    expect(isDemoEmail("attacker@demo.tensixtythree.local.evil.com")).toBe(
      false,
    );
  });
});

describe("seedDemo", () => {
  it("creates a flagged user+org with representative content and a live session", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const demo = await seedDemo(rig.prisma);

    const user = await rig.prisma.user.findUnique({
      where: { id: demo.userId },
    });
    expect(user?.isDemo).toBe(true);
    expect(isDemoEmail(user!.email)).toBe(true);

    const org = await rig.prisma.organization.findUnique({
      where: { id: demo.organizationId },
    });
    expect(org?.isDemo).toBe(true);
    // 75 — the visible name carries no random tag; the slug stays unique.
    expect(org?.name).toBe("Demo Fleet");
    expect(org?.slug).toMatch(/^demo-fleet-[0-9a-f]{4}/);

    const session = await rig.prisma.session.findUnique({
      where: { token: demo.sessionToken },
    });
    expect(session?.userId).toBe(demo.userId);
    expect(session?.activeOrganizationId).toBe(demo.organizationId);
    expect(session!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const [projects, shares, boards, tickets, milestones, posts] =
      await Promise.all([
        rig.prisma.project.count({ where: { isDemo: true } }),
        rig.prisma.orgProjectShare.count({
          where: { organizationId: demo.organizationId },
        }),
        rig.prisma.board.count({
          where: { organizationId: demo.organizationId },
        }),
        rig.prisma.ticket.count(),
        rig.prisma.milestone.count({
          where: { organizationId: demo.organizationId },
        }),
        rig.prisma.orgPost.count({
          where: { organizationId: demo.organizationId },
        }),
      ]);
    expect(projects).toBeGreaterThanOrEqual(2);
    expect(shares).toBeGreaterThanOrEqual(2);
    expect(boards).toBeGreaterThanOrEqual(1);
    expect(tickets).toBeGreaterThanOrEqual(4);
    expect(milestones).toBeGreaterThanOrEqual(2);
    expect(posts).toBeGreaterThanOrEqual(3);
  });
});

describe("seedDemo — a fleet with history (76)", () => {
  it("seeds three projects with repos, activity, tasks, audits and a finished cloud run", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const demo = await seedDemo(rig.prisma);
    const projects = await rig.prisma.project.findMany({
      where: { isDemo: true, orgShares: { some: { organizationId: demo.organizationId } } },
      orderBy: { name: "asc" },
    });
    expect(projects.map((p) => p.name)).toEqual(["Atlas API", "Beacon Mobile", "Meridian Web"]);
    expect(projects.every((p) => p.githubRepo !== null)).toBe(true);
    expect(projects.find((p) => p.name === "Beacon Mobile")?.health).toBe("blocked");
    const ids = projects.map((p) => p.id);

    const [events, tasks, audits] = await Promise.all([
      rig.prisma.activityEvent.count({ where: { projectId: { in: ids } } }),
      rig.prisma.humanTask.count({ where: { projectId: { in: ids }, status: "pending" } }),
      rig.prisma.auditSnapshot.count({ where: { projectId: { in: ids } } }),
    ]);
    expect(events).toBeGreaterThanOrEqual(6);
    expect(tasks).toBeGreaterThanOrEqual(3);
    expect(audits).toBeGreaterThanOrEqual(3);

    const atlas = projects.find((p) => p.name === "Atlas API")!;
    const run = await rig.prisma.dispatch.findFirstOrThrow({
      where: { projectId: atlas.id, runtime: "cloud" },
      include: { outcome: true },
    });
    expect(run.status).toBe("completed");
    // Matches what the scripted assistant says (lib/demo-overseer.ts).
    expect(run.resultBranch).toBe("cloud/demo-atlas-retry");
    expect(run.outcome?.outcome).toBe("success");
    const progress = await rig.prisma.activityEvent.count({
      where: { dispatchId: run.id },
    });
    expect(progress).toBeGreaterThanOrEqual(3);
  });

  it("cleanupDemo sweeps the history with the projects", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const old = await seedDemo(rig.prisma);
    await rig.prisma.user.update({
      where: { id: old.userId },
      data: { createdAt: new Date(Date.now() - 48 * 3600_000) },
    });
    await rig.prisma.project.updateMany({
      where: { isDemo: true },
      data: { createdAt: new Date(Date.now() - 48 * 3600_000) },
    });
    await cleanupDemo(rig.prisma);
    const counts = await Promise.all([
      rig.prisma.project.count({ where: { isDemo: true } }),
      rig.prisma.activityEvent.count(),
      rig.prisma.humanTask.count(),
      rig.prisma.auditSnapshot.count(),
      rig.prisma.dispatch.count(),
      rig.prisma.dispatchOutcome.count(),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("cleanupDemo", () => {
  it("sweeps old demo identities and their content, keeps fresh + real", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const old = await seedDemo(rig.prisma);
    const fresh = await seedDemo(rig.prisma);
    await rig.prisma.user.create({
      data: { id: "real", name: "Real", email: "real@x.dev" },
    });
    // Age the first demo user
    await rig.prisma.user.update({
      where: { id: old.userId },
      data: { createdAt: new Date(Date.now() - 25 * 3600_000) },
    });

    const swept = await cleanupDemo(rig.prisma);
    expect(swept.users).toBe(1);

    expect(
      await rig.prisma.user.findUnique({ where: { id: old.userId } }),
    ).toBeNull();
    expect(
      await rig.prisma.organization.findUnique({
        where: { id: old.organizationId },
      }),
    ).toBeNull();
    expect(
      await rig.prisma.user.findUnique({ where: { id: fresh.userId } }),
    ).not.toBeNull();
    expect(
      await rig.prisma.user.findUnique({ where: { id: "real" } }),
    ).not.toBeNull();
  });
});

describe("70 — demo deletes that work", () => {
  it("the sweep succeeds with FeatureProposal rows on demo projects", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const old = await seedDemo(rig.prisma);
    const projects = await rig.prisma.project.findMany({
      where: { isDemo: true, orgShares: { some: { organizationId: old.organizationId } } },
    });
    const feature = await rig.prisma.upstreamFeature.create({
      data: { name: "f", category: "hook", description: "d", integrationRecipe: "r" },
    });
    await rig.prisma.featureProposal.create({
      data: { projectId: projects[0].id, featureId: feature.id, diff: "d" },
    });
    await rig.prisma.user.update({
      where: { id: old.userId },
      data: { createdAt: new Date(Date.now() - 25 * 3600_000) },
    });
    await expect(cleanupDemo(rig.prisma)).resolves.toMatchObject({ users: 1 });
    expect(await rig.prisma.project.count({ where: { id: { in: projects.map((p) => p.id) } } })).toBe(0);
  });

  it("an old demo project with no share is swept by age", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const orphan = await rig.prisma.project.create({
      data: {
        name: "orphan",
        slug: "demo-orphan",
        path: "/demo/orphan",
        isDemo: true,
        createdAt: new Date(Date.now() - 25 * 3600_000),
      },
    });
    const real = await rig.prisma.project.create({
      data: { name: "real", slug: "real", path: "/p/real", createdAt: new Date(0) },
    });
    await cleanupDemo(rig.prisma);
    expect(await rig.prisma.project.findUnique({ where: { id: orphan.id } })).toBeNull();
    expect(await rig.prisma.project.findUnique({ where: { id: real.id } })).not.toBeNull();
  });

  it("the seed runs in one transaction", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const spy = vi.spyOn(rig.prisma, "$transaction");
    await seedDemo(rig.prisma);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
