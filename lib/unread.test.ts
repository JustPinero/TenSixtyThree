/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { getUnreadCount, getAllUnreadCounts, markAuditsRead } from "./unread";


let rig: DispatchRig | null = null;
let prisma: PrismaClient;
let projectId: number;

beforeAll(async () => {

  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;


  // Create a project
  const project = await prisma.project.create({
    data: {
      name: "Unread Test",
      slug: "unread-test",
      path: "/tmp/unread-test",
    },
  });
  projectId = project.id;

  // Create some audit snapshots (2 unread, 1 read)
  await prisma.auditSnapshot.createMany({
    data: [
      {
        projectId,
        phase: "phase-1",
        auditType: "test-audit",
        isRead: false,
      },
      {
        projectId,
        phase: "phase-1",
        auditType: "bughunt",
        isRead: false,
      },
      {
        projectId,
        phase: "phase-1",
        auditType: "optimize",
        isRead: true,
      },
    ],
  });
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
});

describe("unread", () => {
  it("getUnreadCount returns correct count", async () => {
    const count = await getUnreadCount(prisma, projectId);
    expect(count).toBe(2);
  });

  it("getAllUnreadCounts returns map with correct counts", async () => {
    const counts = await getAllUnreadCounts(prisma);
    expect(counts.get(projectId)).toBe(2);
  });

  it("markAuditsRead marks all unread as read", async () => {
    const marked = await markAuditsRead(prisma, projectId);
    expect(marked).toBe(2);

    const count = await getUnreadCount(prisma, projectId);
    expect(count).toBe(0);
  });

  it("markAuditsRead returns 0 when all already read", async () => {
    const marked = await markAuditsRead(prisma, projectId);
    expect(marked).toBe(0);
  });
});
