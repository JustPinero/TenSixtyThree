/**
 * Phase 68.2 — a hosted user connects a GitHub repo and owns the result.
 *
 * The project is cloud-only (path `/cloud/<slug>`, never a directory on
 * this server): the runner clones `githubRepo` when it is dispatched.
 * Visibility follows ownership (lib/project-access.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, requireSignedIn } from "@/lib/access";
import { normalizeGithubRepo } from "@/lib/github-repo";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "project"
  );
}

export async function POST(request: NextRequest) {
  const access = await requireSignedIn(request, { allowDemo: false });
  if (!access.ok) return access.response;
  try {
    const body = await request.json().catch(() => ({}));
    const githubRepo = normalizeGithubRepo(
      typeof body.githubRepo === "string" ? body.githubRepo : "",
    );
    if (!githubRepo) {
      return NextResponse.json(
        { error: "Enter a GitHub repository as owner/repo or its URL." },
        { status: 400 },
      );
    }
    const userId = access.viewer.userId;

    const existing = await prisma.project.findFirst({
      where: {
        ownerUserId: userId,
        githubRepo: { equals: githubRepo, mode: "insensitive" },
      },
      select: { slug: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: "You've already connected this repository.",
          slug: existing.slug,
        },
        { status: 409 },
      );
    }

    const repoName = githubRepo.split("/")[1];
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim().slice(0, 80)
        : repoName;
    const base = slugify(repoName);
    let slug = base;
    for (
      let n = 2;
      await prisma.project.findUnique({
        where: { slug },
        select: { id: true },
      });
      n++
    ) {
      slug = `${base}-${n}`;
    }

    const project = await prisma.project.create({
      data: {
        name,
        slug,
        path: `/cloud/${slug}`,
        githubRepo,
        ownerUserId: userId,
        status: "building",
        health: "idle",
      },
      select: {
        id: true,
        slug: true,
        name: true,
        githubRepo: true,
        ownerUserId: true,
      },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return jsonError(error, "projects.connect");
  }
}
