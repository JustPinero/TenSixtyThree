import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(messages);
  } catch (error) {
    return jsonError(error, "overseer.history");
  }
}

/**
 * POST /api/overseer/history
 *
 * Save a chat message.
 * Body: { role, content, sessionDate? }
 */
export async function POST(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    const body = await request.json();
    const { role, content, sessionDate } = body;

    if (!role || !content) {
      return NextResponse.json(
        { error: "role and content are required" },
        { status: 400 }
      );
    }

    const date =
      sessionDate || new Date().toISOString().split("T")[0];

    const msg = await prisma.chatMessage.create({
      data: {
        role,
        content,
        sessionDate: date,
        userId: viewerUserId(access.viewer),
      },
    });

    return NextResponse.json(msg, { status: 201 });
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
