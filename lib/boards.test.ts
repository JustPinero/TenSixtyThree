/** 54.4 — board core: positions, access, creation. */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  positionBetween,
  positionAfter,
  createBoard,
  canAccessBoard,
} from "./boards";
import { createOrg } from "./orgs";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

describe("positions", () => {
  it("positionBetween returns the midpoint; positionAfter spaces out", () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
    expect(positionAfter(2000)).toBeGreaterThan(2000);
    expect(positionAfter(null)).toBeGreaterThan(0);
  });

  it("repeated betweens keep strict ordering", () => {
    let lo = 1000;
    const hi = 2000;
    let prev = lo;
    for (let i = 0; i < 20; i++) {
      const mid = positionBetween(lo, hi);
      expect(mid).toBeGreaterThan(prev === lo ? lo : prev);
      expect(mid).toBeLessThan(hi);
      lo = mid;
      prev = mid;
    }
  });
});

describe("createBoard + canAccessBoard", () => {
  async function users(r: DispatchRig) {
    await r.prisma.user.create({
      data: { id: "u1", name: "a", email: "a@x.dev" },
    });
    await r.prisma.user.create({
      data: { id: "u2", name: "b", email: "b@x.dev" },
    });
  }

  it("rejects boards with zero or two owners", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await users(rig);
    await expect(createBoard(rig.prisma, { name: "X" })).rejects.toThrow(
      /exactly one/i,
    );
    const org = await createOrg(rig.prisma, { name: "O", ownerId: "u1" });
    await expect(
      createBoard(rig.prisma, {
        name: "X",
        organizationId: org.id,
        ownerUserId: "u1",
      }),
    ).rejects.toThrow(/exactly one/i);
  });

  it("seeds Todo/In Progress/Done columns in order", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await users(rig);
    const board = await createBoard(rig.prisma, {
      name: "Personal",
      ownerUserId: "u1",
    });
    const columns = await rig.prisma.boardColumn.findMany({
      where: { boardId: board.id },
      orderBy: { position: "asc" },
    });
    expect(columns.map((c) => c.name)).toEqual(["Todo", "In Progress", "Done"]);
  });

  it("org boards admit members only; personal boards the owner only", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await users(rig);
    const org = await createOrg(rig.prisma, { name: "O", ownerId: "u1" });
    const orgBoard = await createBoard(rig.prisma, {
      name: "Org board",
      organizationId: org.id,
    });
    const personal = await createBoard(rig.prisma, {
      name: "Mine",
      ownerUserId: "u1",
    });

    expect(await canAccessBoard(rig.prisma, "u1", orgBoard.id)).toBe(true);
    expect(await canAccessBoard(rig.prisma, "u2", orgBoard.id)).toBe(false);
    expect(await canAccessBoard(rig.prisma, "u1", personal.id)).toBe(true);
    expect(await canAccessBoard(rig.prisma, "u2", personal.id)).toBe(false);
  });
});
