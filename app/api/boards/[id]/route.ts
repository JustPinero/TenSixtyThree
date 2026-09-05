/** 54.4 — full board: columns + tickets. 404s inaccessible boards. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { canAccessBoard } from "@/lib/boards";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
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
      where: { boardId: id },
      orderBy: { position: "asc" },
    }),
  ]);
  return NextResponse.json({ board, columns, tickets });
}
