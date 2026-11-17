/**
 * 52.1 — hosted cloud dispatch: enqueue a Dispatch row (runtime "cloud")
 * for the runner service to claim. Requires a session, a visible project
 * (55.2 matrix), and a GitHub repo to clone. Demo sessions are refused
 * like every other spend path.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn } from "@/lib/access";
import { isDemoSession } from "@/lib/demo";
import { canSeeProject, canDispatchProject } from "@/lib/project-access";
import { checkRateLimit } from "@/lib/rate-limiter";
import { PUBLIC_DISPATCH_SELECT, publicDispatch } from "@/lib/runner/public-dispatch";
import { cloudPermissionFor } from "@/lib/runner/autonomy";

const MODES = ["continue", "audit", "investigate", "custom"];

export async function POST(request: NextRequest) {
  const access = await requireSignedIn(request);
  if (!access.ok) return access.response;
  const session = access.viewer.session;
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
  // 65.4 — seeing is not driving: owner, org owner/admin, or site admin.
  if (!(await canDispatchProject(prisma, session.user.id, project.id))) {
    return NextResponse.json(
      { error: "Only the project's owner or an org admin can start cloud runs" },
      { status: 403 },
    );
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
  // 65.4 — non-admins run on their own key; the app key is the
  // operator's, not a free tier.
  if (!access.viewer.isAdmin) {
    const owner = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { anthropicKeyEnc: true },
    });
    if (!owner?.anthropicKeyEnc) {
      return NextResponse.json(
        { error: "Cloud runs use your own Anthropic key. Add one in Settings first." },
        { status: 402 },
      );
    }
  }
  // 65.4 — one active run per (user, project), and a per-user ceiling.
  const active = await prisma.dispatch.findFirst({
    where: {
      projectId: project.id,
      ownerUserId: session.user.id,
      runtime: "cloud",
      status: { in: ["queued", "started"] },
    },
    select: { id: true },
  });
  if (active) {
    return NextResponse.json(
      { error: "A cloud run for this project is already in progress", dispatchId: active.id },
      { status: 409 },
    );
  }
  const limited = checkRateLimit(`cloud-dispatch:${session.user.id}`, 20, 3600_000);
  if (limited) return limited;

  const created = await prisma.dispatch.create({
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
    select: PUBLIC_DISPATCH_SELECT,
  });
  return NextResponse.json({ dispatch: publicDispatch(created) });
}
