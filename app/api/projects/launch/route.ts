import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { launchProject } from "@/lib/project-launcher";
import path from "path";
import os from "os";
import { requireLocalMode, jsonError, viewerUserId } from "@/lib/access";
import { isSafeDirName, isValidSlug } from "@/lib/validators";

function resolveProjectsDir(): string {
  const dir = process.env.PROJECTS_DIR || "~/Desktop/projects";
  if (dir.startsWith("~")) {
    return path.join(os.homedir(), dir.slice(1));
  }
  return path.resolve(dir);
}

export async function POST(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  try {
    const body = await request.json();
    const {
      name,
      slug,
      projectType,
      kickoffContent,
      createGithubRepo,
      isPrivate,
      autonomyMode,
      agentTeamsEnabled,
      prWorkflowEnabled,
    } = body;

    if (!name || !slug || !kickoffContent) {
      return NextResponse.json(
        { error: "name, slug, and kickoffContent are required" },
        { status: 400 }
      );
    }

    // 64.3 — `name` becomes a directory and `slug` a GitHub repo name.
    if (
      typeof name !== "string" ||
      typeof slug !== "string" ||
      !isSafeDirName(name) ||
      !isValidSlug(slug)
    ) {
      return NextResponse.json(
        { error: "name must be a plain folder name and slug may use only letters, digits, . _ -" },
        { status: 400 }
      );
    }

    const projectsDir = resolveProjectsDir();

    const result = await launchProject(prisma, projectsDir, {
      name,
      slug,
      projectType: projectType || "web-app",
      kickoffContent,
      createGithubRepo: createGithubRepo || false,
      isPrivate: isPrivate ?? true,
      autonomyMode: autonomyMode || "semi",
      agentTeamsEnabled: agentTeamsEnabled || false,
      prWorkflowEnabled: prWorkflowEnabled || false,
      // 68.2 — a signed-in creator owns the project; the bare local
      // operator creates fleet projects (null owner).
      ownerUserId: viewerUserId(access.viewer),
    });

    if (result.success) {
      return NextResponse.json(result, { status: 201 });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    return jsonError(error, "projects.launch");
  }
}
