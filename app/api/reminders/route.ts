import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkReminders } from "@/lib/reminders";
import { jsonError, requireNonDemo, requireUser } from "@/lib/access";

export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    // Check conditions and trigger any that are met
    await checkReminders(prisma);

    // Return all non-dismissed reminders
    const reminders = await prisma.reminder.findMany({
      where: { status: { not: "dismissed" } },
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

    const reminder = await prisma.reminder.create({
      data: {
        message,
        conditionType,
        conditionValue,
        projectSlug: projectSlug || null,
        createdBy: createdBy || "user",
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

    const reminder = await prisma.reminder.update({
      where: { id },
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
