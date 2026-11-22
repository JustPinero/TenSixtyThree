/** 54.4 — full board: columns + tickets. 404s inaccessible boards. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn } from "@/lib/access";
import { canAccessBoard } from "@/lib/boards";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireSignedIn(request);
  if (!access.ok) return access.response;
  const session = access.viewer.session;
  const { id } = await params;
  if (!(await canAccessBoard(prisma, session.user.id, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [board, columns, tickets] = await Promise.all([
    prisma.board.findUnique({ where: { id } }),
    prisma.boardColumn.findMany({
      where: { boardId: id },
      orderBy: { position: "asc" },
    }),
    prisma.ticket.findMany({
      take: 500, // phase 70 — bounded list
      where: { boardId: id },
      orderBy: { position: "asc" },
    }),
  ]);
  return NextResponse.json({ board, columns, tickets });
}
