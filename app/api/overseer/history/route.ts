import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidSessionDate } from "@/lib/chat-session";
import {
  jsonError,
  requireNonDemo,
  requireUser,
  viewerUserId,
} from "@/lib/access";

/**
 * GET /api/overseer/history
 *
 * Returns chat messages for a given date (defaults to today).
 * Query params: date (YYYY-MM-DD)
 */
export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    const date =
      request.nextUrl.searchParams.get("date") ||
      new Date().toISOString().split("T")[0];

    const messages = await prisma.chatMessage.findMany({
      take: 500, // phase 70 — bounded list
      // Phase 66.1 — the viewer's own history only (null = local operator).
      where: { sessionDate: date, userId: viewerUserId(access.viewer) },
      // 69.3 — id breaks createdAt ties (a turn's rows share a timestamp).
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    return NextResponse.json(messages);
  } catch (error) {
    return jsonError(error, "overseer.history");
  }
}

/**
 * POST /api/overseer/history
 *
 * Phase 69.3 — one request per chat TURN: { messages: [{role, content}…],
 * sessionDate } written in one transaction, in order (a user message can
 * no longer land after its reply, or without it). The single-message
 * shape { role, content, sessionDate? } is still accepted.
 * sessionDate is the client's LOCAL date (server UTC would split a
 * conversation at midnight UTC).
 */
const ROLES = new Set(["user", "assistant"]);
const MAX_CONTENT = 100_000;
const MAX_TURN = 20;

function validMessage(m: unknown): m is { role: string; content: string } {
  if (typeof m !== "object" || m === null) return false;
  const { role, content } = m as { role?: unknown; content?: unknown };
  return (
    typeof role === "string" &&
    ROLES.has(role) &&
    typeof content === "string" &&
    content.length > 0 &&
    content.length <= MAX_CONTENT
  );
}

export async function POST(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    const body = await request.json();
    const turn: unknown[] = Array.isArray(body.messages)
      ? body.messages
      : [{ role: body.role, content: body.content }];
    if (turn.length === 0 || turn.length > MAX_TURN || !turn.every(validMessage)) {
      return NextResponse.json(
        { error: "messages must be 1-20 {role: user|assistant, content} items" },
        { status: 400 },
      );
    }
    const date = isValidSessionDate(body.sessionDate)
      ? body.sessionDate
      : new Date().toISOString().split("T")[0];
    const userId = viewerUserId(access.viewer);

    // Sequential creates inside one transaction: ids (the GET tiebreak)
    // follow the turn order, and a failure writes nothing.
    const saved = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const m of turn as { role: string; content: string }[]) {
        rows.push(
          await tx.chatMessage.create({
            data: { role: m.role, content: m.content, sessionDate: date, userId },
          }),
        );
      }
      return rows;
    });

    return NextResponse.json(Array.isArray(body.messages) ? saved : saved[0], { status: 201 });
  } catch (error) {
    return jsonError(error, "overseer.history");
  }
}

/**
 * DELETE /api/overseer/history
 *
 * Clear chat history for a date.
 * Query params: date (YYYY-MM-DD), defaults to today
 */
export async function DELETE(request: NextRequest) {
  const access = await requireNonDemo(request);
  if (!access.ok) return access.response;
  try {
    const date =
      request.nextUrl.searchParams.get("date") ||
      new Date().toISOString().split("T")[0];

    await prisma.chatMessage.deleteMany({
      where: { sessionDate: date, userId: viewerUserId(access.viewer) },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "overseer.history");
  }
}
