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
import { REPO_ACCESS_MESSAGE, verifyRepoPushAccess } from "@/lib/github-access";
import {
  appInstallUrl,
  githubAppConfig,
  installationForRepo,
} from "@/lib/github-app";

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

    // Security review (critical): the runner clones and pushes with the
    // operator's token, so a user may only connect a repo THEIR OWN GitHub
    // account can push to. Admins are the operator — the token is theirs.
    if (!access.viewer.isAdmin) {
      const check = await verifyRepoPushAccess(prisma, userId, githubRepo);
      if (!check.ok) {
        return NextResponse.json(
          { error: REPO_ACCESS_MESSAGE[check.reason], reason: check.reason },
          { status: 403 },
        );
      }
    }

    // Phase 74 — the runner reaches GitHub as the app, so the repo's owner
    // must have installed it. Everyone, admins included.
    const app = githubAppConfig();
    if (app) {
      const installed = await installationForRepo(app, githubRepo).catch(() => {
        throw new Error("Couldn't reach GitHub to check the app installation.");
      });
      if (installed === null) {
        return NextResponse.json(
          {
            error: `Install the TenSixtyThree GitHub App on ${githubRepo} first, then connect it again.`,
            reason: "app-not-installed",
            installUrl: appInstallUrl(app),
          },
          { status: 409 },
        );
      }
    }

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
