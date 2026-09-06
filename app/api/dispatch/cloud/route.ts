/**
 * 52.1 — hosted cloud dispatch: enqueue a Dispatch row (runtime "cloud")
 * for the runner service to claim. Requires a session, a visible project
 * (55.2 matrix), and a GitHub repo to clone. Demo sessions are refused
 * like every other spend path.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { isDemoSession } from "@/lib/demo";
import { canSeeProject } from "@/lib/project-access";
import { cloudPermissionFor } from "@/lib/runner/autonomy";

const MODES = ["continue", "audit", "investigate", "custom"];

export async function POST(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  if (isDemoSession(session)) {
    return NextResponse.json(
      { error: "Demo mode: dispatching is disabled in the sandbox." },
      { status: 403 },
    );
  }

  const body = await request.json();
  const slug = typeof body.slug === "string" ? body.slug : "";
  const mode = MODES.includes(body.mode) ? body.mode : "continue";

  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project || !(await canSeeProject(prisma, session.user.id, project.id))) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!project.githubRepo) {
    return NextResponse.json(
      { error: "Cloud dispatch needs a GitHub repo on the project" },
      { status: 400 },
    );
  }
  // 52.8 — honor the project's autonomy toggle; manual can't run headless.
  const permission = cloudPermissionFor(project.autonomyMode);
  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 400 });
  }

  const dispatch = await prisma.dispatch.create({
    data: {
      projectId: project.id,
      projectSlug: project.slug,
      mode,
      runtime: "cloud",
      status: "queued",
      healthAtDispatch: project.health,
      ownerUserId: session.user.id,
      organizationId: session.session.activeOrganizationId,
      ...(mode === "custom" && typeof body.prompt === "string"
        ? { customPrompt: body.prompt.slice(0, 5000) }
        : {}),
    },
  });
  return NextResponse.json({ dispatch });
}
