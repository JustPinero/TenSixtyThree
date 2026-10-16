/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { checkClaudeCodeVersion } from "@/lib/version-watcher";


let rig: DispatchRig | null = null;
let prisma: PrismaClient;

beforeAll(async () => {
  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
});

beforeEach(async () => {
  // Reset config + activity each test.
  await prisma.activityEvent.deleteMany({});
  await prisma.cascadeConfig.deleteMany({});
});

describe("checkClaudeCodeVersion", () => {
  it("returns 'noop' when claude --version is not available", async () => {
    const result = await checkClaudeCodeVersion(prisma, {
      readVersion: () => null,
    });
    expect(result.status).toBe("noop");
    expect(result.reason).toContain("not available");
  });

  it("records first version on initial run without firing a notification", async () => {
    const result = await checkClaudeCodeVersion(prisma, {
      readVersion: () => "1.0.0",
    });
    expect(result.status).toBe("first-recorded");
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.previousVersion).toBeNull();

    const events = await prisma.activityEvent.findMany({
      where: { eventType: "feature-check-needed" },
    });
    expect(events.length).toBe(0);
  });

  it("returns 'noop' when version is unchanged", async () => {
    await prisma.cascadeConfig.create({
      data: { id: 1, lastSeenClaudeCodeVersion: "1.0.0" },
    });

    const result = await checkClaudeCodeVersion(prisma, {
      readVersion: () => "1.0.0",
    });
    expect(result.status).toBe("noop");

    const events = await prisma.activityEvent.findMany({
      where: { eventType: "feature-check-needed" },
    });
    expect(events.length).toBe(0);
  });

  it("emits a feature-check-needed ActivityEvent when version changes", async () => {
    await prisma.cascadeConfig.create({
      data: { id: 1, lastSeenClaudeCodeVersion: "1.0.0" },
    });

    const result = await checkClaudeCodeVersion(prisma, {
      readVersion: () => "1.1.0",
    });
    expect(result.status).toBe("version-changed");
    expect(result.previousVersion).toBe("1.0.0");
    expect(result.currentVersion).toBe("1.1.0");

    const events = await prisma.activityEvent.findMany({
      where: { eventType: "feature-check-needed" },
    });
    expect(events.length).toBe(1);
    expect(events[0].summary).toContain("1.0.0");
    expect(events[0].summary).toContain("1.1.0");
    expect(events[0].summary).toContain("/anthropic-feature-update-check");
  });

  it("persists the new version after a change", async () => {
    await prisma.cascadeConfig.create({
      data: { id: 1, lastSeenClaudeCodeVersion: "1.0.0" },
    });
    await checkClaudeCodeVersion(prisma, { readVersion: () => "1.2.0" });

    const config = await prisma.cascadeConfig.findUnique({ where: { id: 1 } });
    expect(config?.lastSeenClaudeCodeVersion).toBe("1.2.0");
  });
});
