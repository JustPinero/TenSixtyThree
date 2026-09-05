/**
 * 54.4 — kanban board core.
 *
 * Boards (and milestones) are org-scoped (organizationId → members) or
 * personal (ownerUserId → owner only); exactly one owner field, enforced
 * here app-level. Ordering uses fractional positions — dragging between
 * neighbors writes the midpoint, appending adds a fixed gap, so no mass
 * renumbering on drag.
 */
import type { PrismaClient, Board } from "@/app/generated/prisma/client";
import { requireMembership } from "./orgs";

const GAP = 1024;

export function positionAfter(last: number | null): number {
  return (last ?? 0) + GAP;
}

export function positionBetween(before: number, after: number): number {
  return before + (after - before) / 2;
}

export const DEFAULT_COLUMNS = ["Todo", "In Progress", "Done"] as const;

export async function createBoard(
  prisma: PrismaClient,
  args: { name: string; organizationId?: string; ownerUserId?: string },
): Promise<Board> {
  const owners = [args.organizationId, args.ownerUserId].filter(Boolean);
  if (owners.length !== 1) {
    throw new Error(
      "A board needs exactly one owner: organizationId or ownerUserId",
    );
  }
  const board = await prisma.board.create({
    data: {
      name: args.name,
      organizationId: args.organizationId ?? null,
      ownerUserId: args.ownerUserId ?? null,
    },
  });
  await prisma.boardColumn.createMany({
    data: DEFAULT_COLUMNS.map((name, i) => ({
      boardId: board.id,
      name,
      position: (i + 1) * GAP,
    })),
  });
  return board;
}

export async function canAccessBoard(
  prisma: PrismaClient,
  userId: string,
  boardId: string,
): Promise<boolean> {
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board) return false;
  if (board.ownerUserId) return board.ownerUserId === userId;
  if (board.organizationId) {
    return (
      (await requireMembership(prisma, userId, board.organizationId)) !== null
    );
  }
  return false;
}
