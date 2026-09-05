/** 54.5 — demo sandbox core. */
import { describe, it, expect, afterEach } from "vitest";
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
