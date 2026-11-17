import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { markAuditsRead } from "@/lib/unread";
import { isValidSlug } from "@/lib/validators";
import { validateBadges } from "@/lib/badges";
import { THEME_KEYS, type ThemeKey } from "@/lib/theme-registry";
import { canSeeProject, canEditProject } from "@/lib/project-access";
import { jsonError, requireUser } from "@/lib/access";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    const { slug } = await params;
    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }
    const project = await prisma.project.findUnique({
      where: { slug },
      include: {
        auditSnapshots: {
          orderBy: { capturedAt: "desc" },
          take: 10,
        },
        activityEvents: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 55.2 — visibility gate ([54.D1]): strangers get the same 404.
    {
      const session = access.viewer.kind === "user" ? access.viewer.session : null;
      if (!(await canSeeProject(prisma, session?.user.id ?? null, project.id))) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
    }

    // Mark audits as read when viewing project
    await markAuditsRead(prisma, project.id);

    return NextResponse.json(project);
  } catch (error) {
    return jsonError(error, "projects.[slug]");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    const { slug } = await params;
    const body = await request.json();

    // 55.2 — visibility gate ([54.D1])
    {
      const target = await prisma.project.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (target) {
        const session = access.viewer.kind === "user" ? access.viewer.session : null;
        const userId = session?.user.id ?? null;
        if (!(await canSeeProject(prisma, userId, target.id))) {
          return NextResponse.json(
            { error: "Project not found" },
            { status: 404 },
          );
        }
        // 65.4 — seeing is not editing (autonomyMode decides what a cloud
        // run may do). Demo visitors may still edit their own sandbox.
        const isDemoSandbox =
          access.viewer.kind === "user" && access.viewer.isDemo;
        if (!isDemoSandbox && !(await canEditProject(prisma, userId, target.id))) {
          return NextResponse.json(
            { error: "Only the project's owner or an org admin can change it" },
            { status: 403 },
          );
        }
      }
    }

    // Allowlist updatable fields to prevent mass assignment
    const ALLOWED_FIELDS = new Set([
      "status",
      "currentPhase",
      "currentRequest",
      "health",
      "healthDetails",
      "autonomyMode",
      "agentTeamsEnabled",
      "prWorkflowEnabled",
      "stack",
      "progressScore",
      "progressDetails",
      "deploymentInfo",
      "businessStage",
      "projectContext",
      "completionCriteria",
      "badges",
      "deadline",
      "lastSessionEndedAt",
      "themeKey",
    ]);

    // Enum validation for constrained fields
    const VALID_STATUS = new Set([
      "building",
      "complete",
      "deployed",
      "backburner",
      "paused",
      "archived",
    ]);
    const VALID_BUSINESS_STAGE = new Set([
      "building",
      "pre-sale",
      "active-sale",
      "revenue",
      "growth",
      "internal",
    ]);
    const VALID_HEALTH = new Set(["healthy", "warning", "blocked", "idle"]);
    const VALID_AUTONOMY = new Set(["full", "semi", "manual"]);

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_FIELDS.has(key)) continue;

      // Validate enum fields
      if (key === "status" && !VALID_STATUS.has(value as string)) continue;
      if (key === "health" && !VALID_HEALTH.has(value as string)) continue;
      if (key === "autonomyMode" && !VALID_AUTONOMY.has(value as string))
        continue;
      if (key === "businessStage" && !VALID_BUSINESS_STAGE.has(value as string))
        continue;
      if (
        (key === "agentTeamsEnabled" || key === "prWorkflowEnabled") &&
        typeof value !== "boolean"
      )
        continue;
      if (key === "badges") {
        data[key] = JSON.stringify(validateBadges(value as string[]));
        continue;
      }
      // 53.4 — per-project persona: registry key or explicit null (inherit)
      if (key === "themeKey") {
        if (value === null) {
          data[key] = null;
        } else if (
          typeof value === "string" &&
          THEME_KEYS.includes(value as ThemeKey)
        ) {
          data[key] = value;
        }
        continue;
      }

      data[key] = value;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const project = await prisma.project.update({
      where: { slug },
      data,
    });

    return NextResponse.json(project);
  } catch (error) {
    return jsonError(error, "projects.[slug]");
  }
}
