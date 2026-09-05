/** 54.4b — Linear → board import (idempotent by linearIssueId). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { createBoard } from "./boards";
import { syncLinearIssues, mapStateToColumn } from "./linear-sync";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

const ISSUES = [
  {
    id: "lin-1",
    title: "Fix login",
    description: "OAuth loop",
    state: { type: "started" },
    priority: 2,
  },
  {
    id: "lin-2",
    title: "Write docs",
    description: "",
    state: { type: "unstarted" },
    priority: 0,
  },
  {
    id: "lin-3",
    title: "Shipped thing",
    description: "",
    state: { type: "completed" },
    priority: 1,
  },
];

describe("mapStateToColumn", () => {
  it("maps Linear state types onto the default columns", () => {
    expect(mapStateToColumn("unstarted")).toBe("Todo");
    expect(mapStateToColumn("backlog")).toBe("Todo");
    expect(mapStateToColumn("started")).toBe("In Progress");
    expect(mapStateToColumn("completed")).toBe("Done");
    expect(mapStateToColumn("canceled")).toBe("Done");
    expect(mapStateToColumn("mystery")).toBe("Todo");
  });
});

describe("syncLinearIssues", () => {
  it("imports issues into the right columns, then updates on re-sync", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await rig.prisma.user.create({
      data: { id: "u1", name: "a", email: "a@x.dev" },
    });
    const board = await createBoard(rig.prisma, {
      name: "Synced",
      ownerUserId: "u1",
    });

    const fetchIssues = vi.fn().mockResolvedValue(ISSUES);
    const first = await syncLinearIssues(rig.prisma, {
      boardId: board.id,
      createdById: "u1",
      fetchIssues,
    });
    expect(first.created).toBe(3);
    expect(first.updated).toBe(0);

    const tickets = await rig.prisma.ticket.findMany({
      where: { boardId: board.id },
      include: { column: true },
    });
    expect(tickets).toHaveLength(3);
    expect(tickets.find((t) => t.linearIssueId === "lin-1")?.column.name).toBe(
      "In Progress",
    );

    // Re-sync with a title change + state move: updates, no duplicates.
    fetchIssues.mockResolvedValue([
      { ...ISSUES[0], title: "Fix login v2", state: { type: "completed" } },
      ISSUES[1],
      ISSUES[2],
    ]);
    const second = await syncLinearIssues(rig.prisma, {
      boardId: board.id,
      createdById: "u1",
      fetchIssues,
    });
    expect(second.created).toBe(0);
    expect(second.updated).toBeGreaterThanOrEqual(1);
    const after = await rig.prisma.ticket.findMany({
      where: { boardId: board.id },
      include: { column: true },
    });
    expect(after).toHaveLength(3);
    const moved = after.find((t) => t.linearIssueId === "lin-1");
    expect(moved?.title).toBe("Fix login v2");
    expect(moved?.column.name).toBe("Done");
  });
});
