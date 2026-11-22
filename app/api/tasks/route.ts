import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  jsonError,
  requireNonDemo,
  requireUser,
  viewerUserId,
} from "@/lib/access";
import { scopeForViewer, taskWhere, type TenantScope } from "@/lib/tenant-scope";

const NOT_FOUND = () =>
  NextResponse.json({ error: "Not found" }, { status: 404 });

/** Phase 66.2 — a task the viewer can see, or null (callers 404). */
async function visibleTask(scope: TenantScope, id: number) {
  return prisma.humanTask.findFirst({
    where: { AND: [{ id }, taskWhere(scope)] },
    select: { id: true },
  });
}

const VALID_CATEGORIES = new Set([
  "asset",
  "credential",
  "testing",
  "deploy",
  "review",
  "external",
  "other",
]);
const VALID_PRIORITIES = new Set(["high", "normal", "low"]);
const VALID_STATUSES = new Set(["pending", "done"]);

/**
 * GET /api/tasks
 *
 * Returns all human tasks, optionally filtered.
 * Query params: status, projectSlug, category
 */
export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    const status = request.nextUrl.searchParams.get("status");
    const projectSlug = request.nextUrl.searchParams.get("projectSlug");
    const category = request.nextUrl.searchParams.get("category");

    const scope = await scopeForViewer(prisma, access.viewer);
    const where: Record<string, unknown> = {};
    if (status && VALID_STATUSES.has(status)) where.status = status;
    if (projectSlug) where.projectSlug = projectSlug;
    if (category && VALID_CATEGORIES.has(category)) where.category = category;

    const tasks = await prisma.humanTask.findMany({
      where: { AND: [taskWhere(scope), where] },
      orderBy: [
        { status: "asc" }, // pending first
        { priority: "asc" }, // high first (alphabetical: high < low < normal)
        { createdAt: "desc" },
      ],
      include: {
        project: { select: { name: true, slug: true } },
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    return jsonError(error, "tasks");
  }
}

/**
 * POST /api/tasks
 *
 * Create a new human task.
 * Body: { title, category?, priority?, projectSlug?, createdBy? }
 */
export async function POST(request: NextRequest) {
  const access = await requireNonDemo(request);
  if (!access.ok) return access.response;
  try {
    const body = await request.json();
    const { title, category, priority, projectSlug, createdBy } = body;

    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    // Resolve project ID from slug if provided
    // Phase 66.2 — only onto a project the viewer can see; an unknown
    // or invisible slug is the same 404 (no existence oracle).
    let projectId: number | null = null;
    if (projectSlug) {
      const scope = await scopeForViewer(prisma, access.viewer);
      const project = await prisma.project.findFirst({
        where: { AND: [{ slug: String(projectSlug) }, scope.projectWhere] },
        select: { id: true },
      });
      if (!project) return NOT_FOUND();
      projectId = project.id;
    }

    const task = await prisma.humanTask.create({
      data: {
        title: title.trim(),
        category:
          category && VALID_CATEGORIES.has(category) ? category : "other",
        priority:
          priority && VALID_PRIORITIES.has(priority) ? priority : "normal",
        projectId,
        projectSlug: projectSlug || null,
        createdBy: createdBy || "user",
        ownerUserId: viewerUserId(access.viewer),
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return jsonError(error, "tasks");
  }
}

/**
 * PATCH /api/tasks
 *
 * Update a task (toggle status, change priority, etc).
 * Body: { id, status?, priority?, category? }
 */
export async function PATCH(request: NextRequest) {
  const access = await requireNonDemo(request);
  if (!access.ok) return access.response;
  try {
    const body = await request.json();
    const { id, status, priority, category } = body;

    if (!id || typeof id !== "number") {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (status && VALID_STATUSES.has(status)) {
      data.status = status;
      data.completedAt = status === "done" ? new Date() : null;
    }
    if (priority && VALID_PRIORITIES.has(priority)) data.priority = priority;
    if (category && VALID_CATEGORIES.has(category)) data.category = category;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const scope = await scopeForViewer(prisma, access.viewer);
    if (!(await visibleTask(scope, id))) return NOT_FOUND();

    const task = await prisma.humanTask.update({
      where: { id },
      data,
    });

    return NextResponse.json(task);
  } catch (error) {
    return jsonError(error, "tasks");
  }
}

/**
 * DELETE /api/tasks
 *
 * Delete a task.
 * Body: { id }
 */
export async function DELETE(request: NextRequest) {
  const access = await requireNonDemo(request);
  if (!access.ok) return access.response;
  try {
    const body = await request.json();
    const { id } = body;

    if (!id || typeof id !== "number") {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const scope = await scopeForViewer(prisma, access.viewer);
    if (!(await visibleTask(scope, id))) return NOT_FOUND();

    await prisma.humanTask.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "tasks");
  }
}
