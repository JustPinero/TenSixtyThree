/** 54.4 — tickets: create, move/edit, delete. Board access enforced. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { canAccessBoard, positionAfter } from "@/lib/boards";

const PRIORITIES = ["low", "normal", "high", "urgent"];

async function guard(request: NextRequest, boardId: string) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) return { error: 401 as const };
  if (!(await canAccessBoard(prisma, session.user.id, boardId))) {
    return { error: 404 as const };
  }
  return { session };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const boardId = typeof body.boardId === "string" ? body.boardId : "";
  const g = await guard(request, boardId);
  if ("error" in g) {
    return NextResponse.json(
      { error: g.error === 401 ? "Authentication required" : "Not found" },
      { status: g.error }
    );
  }
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const columnId = typeof body.columnId === "string" ? body.columnId : "";
  if (!title || title.length > 200 || !columnId) {
    return NextResponse.json(
      { error: "title (1-200) and columnId required" },
      { status: 400 }
    );
  }
  const column = await prisma.boardColumn.findFirst({
    where: { id: columnId, boardId },
  });
  if (!column) {
    return NextResponse.json({ error: "Column not on that board" }, { status: 400 });
  }
  const last = await prisma.ticket.findFirst({
    where: { columnId },
    orderBy: { position: "desc" },
  });
  const ticket = await prisma.ticket.create({
    data: {
      boardId,
      columnId,
      title,
      description:
        typeof body.description === "string" ? body.description.slice(0, 5000) : "",
      priority: PRIORITIES.includes(body.priority) ? body.priority : "normal",
      position: positionAfter(last?.position ?? null),
      createdById: g.session.user.id,
      ...(typeof body.milestoneId === "string"
        ? { milestoneId: body.milestoneId }
        : {}),
    },
  });
  return NextResponse.json({ ticket });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  const existing = await prisma.ticket.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const g = await guard(request, existing.boardId);
  if ("error" in g) {
    return NextResponse.json(
      { error: g.error === 401 ? "Authentication required" : "Not found" },
      { status: g.error }
    );
  }
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim().slice(0, 200);
  }
  if (typeof body.description === "string") {
    data.description = body.description.slice(0, 5000);
  }
  if (typeof body.priority === "string" && PRIORITIES.includes(body.priority)) {
    data.priority = body.priority;
  }
  if (typeof body.columnId === "string") {
    const column = await prisma.boardColumn.findFirst({
      where: { id: body.columnId, boardId: existing.boardId },
    });
    if (!column) {
      return NextResponse.json({ error: "Column not on that board" }, { status: 400 });
    }
    data.columnId = body.columnId;
  }
  if (typeof body.position === "number" && Number.isFinite(body.position)) {
    data.position = body.position;
  }
  if (body.assigneeUserId === null || typeof body.assigneeUserId === "string") {
    data.assigneeUserId = body.assigneeUserId;
  }
  if (body.milestoneId === null || typeof body.milestoneId === "string") {
    data.milestoneId = body.milestoneId;
  }
  const ticket = await prisma.ticket.update({ where: { id }, data });
  return NextResponse.json({ ticket });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const id = typeof body.id === "string" ? body.id : "";
  const existing = await prisma.ticket.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const g = await guard(request, existing.boardId);
  if ("error" in g) {
    return NextResponse.json(
      { error: g.error === 401 ? "Authentication required" : "Not found" },
      { status: g.error }
    );
  }
  await prisma.ticket.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
