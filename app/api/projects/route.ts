import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, requireUser } from "@/lib/access";
import { listVisibleProjects } from "@/lib/project-list";

export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    // 55.2 visibility + extras; shared with the server-rendered dashboard (60.2).
    const session = access.viewer.kind === "user" ? access.viewer.session : null;
    const projectsWithExtras = await listVisibleProjects(prisma, session?.user.id ?? null);

    return NextResponse.json(projectsWithExtras);
  } catch (error) {
    return jsonError(error, "projects");
  }
}
