import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkReminders, reminderProjectsVisible } from "@/lib/reminders";
import {
  jsonError,
  requireNonDemo,
  requireUser,
  viewerUserId,
} from "@/lib/access";
import { reminderWhere, scopeForViewer } from "@/lib/tenant-scope";

export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    // Check conditions and trigger any that are met
    await checkReminders(prisma);

    // Return all non-dismissed reminders
    const reminders = await prisma.reminder.findMany({
      // Phase 66.2 — the viewer's own reminders (operators: + fleet ones).
      where: {
        AND: [
          reminderWhere(await scopeForViewer(prisma, access.viewer)),
          { status: { not: "dismissed" } },
        ],
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(reminders);
  } catch (error) {
    return jsonError(error, "reminders");
  }
}

export async function POST(request: NextRequest) {
  const access = await requireNonDemo(request);
  if (!access.ok) return access.response;
  try {
    const { message, conditionType, conditionValue, projectSlug, createdBy } =
      await request.json();

    if (!message || !conditionType || !conditionValue) {
      return NextResponse.json(
        { error: "message, conditionType, and conditionValue are required" },
        { status: 400 }
      );
    }

    // 66.2 — never watch a project the creator can't see (state oracle).
    const scope = await scopeForViewer(prisma, access.viewer);
    if (
      !(await reminderProjectsVisible(prisma, scope.projectWhere, {
        conditionType: String(conditionType),
        conditionValue: String(conditionValue),
        projectSlug: projectSlug ? String(projectSlug) : null,
      }))
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const reminder = await prisma.reminder.create({
      data: {
        message,
        conditionType,
        conditionValue,
        projectSlug: projectSlug || null,
        createdBy: createdBy || "user",
        ownerUserId: viewerUserId(access.viewer),
      },
    });

    return NextResponse.json(reminder, { status: 201 });
  } catch (error) {
    return jsonError(error, "reminders");
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireNonDemo(request);
  if (!access.ok) return access.response;
  try {
    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required" },
        { status: 400 }
      );
    }

    const scope = await scopeForViewer(prisma, access.viewer);
    const mine = await prisma.reminder.findFirst({
      where: { AND: [{ id: Number(id) }, reminderWhere(scope)] },
      select: { id: true },
    });
    if (!mine) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const reminder = await prisma.reminder.update({
      where: { id: mine.id },
      data: {
        status,
        triggeredAt: status === "triggered" ? new Date() : undefined,
      },
    });

    return NextResponse.json(reminder);
  } catch (error) {
    return jsonError(error, "reminders");
  }
}
