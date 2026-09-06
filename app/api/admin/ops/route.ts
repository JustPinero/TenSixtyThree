/**
 * 52.3 — operator ops surface, headless.
 *
 * Exists because the hosted DB is (correctly) private-network-only and
 * `railway ssh` proved unreliable for piped SQL. Trust model mirrors the
 * Stop-hook webhook secret (42.x): a long random OPS_SECRET env,
 * constant-time compared; endpoint 404s entirely when unset. Structured
 * ops only — no raw SQL, no destructive verbs.
 */
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function authorized(request: NextRequest): "disabled" | "no" | "yes" {
  const secret = process.env.OPS_SECRET;
  if (!secret || secret.length < 16) return "disabled";
  const given = request.headers.get("x-ops-secret") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return "no";
  return timingSafeEqual(a, b) ? "yes" : "no";
}

const MODES = ["continue", "audit", "investigate", "custom"];
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export async function POST(request: NextRequest) {
  const auth = authorized(request);
  if (auth === "disabled") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (auth === "no") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (body.op === "seed-project") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const slug = typeof body.slug === "string" ? body.slug : "";
    const githubRepo =
      typeof body.githubRepo === "string" ? body.githubRepo : "";
    if (!name || !SLUG_RE.test(slug) || !REPO_RE.test(githubRepo)) {
      return NextResponse.json(
        { error: "name, slug, githubRepo required" },
        { status: 400 },
      );
    }
    const project = await prisma.project.upsert({
      where: { slug },
      update: { name, githubRepo },
      create: { name, slug, githubRepo, path: `/cloud/${slug}` },
    });
    return NextResponse.json({ project });
  }

  if (body.op === "enqueue-cloud") {
    const slug = typeof body.slug === "string" ? body.slug : "";
    const mode = MODES.includes(body.mode) ? body.mode : "audit";
    const project = await prisma.project.findUnique({ where: { slug } });
    if (!project?.githubRepo) {
      return NextResponse.json(
        { error: "No such project (or repo-less)" },
        { status: 400 },
      );
    }
    const dispatch = await prisma.dispatch.create({
      data: {
        projectId: project.id,
        projectSlug: slug,
        mode,
        runtime: "cloud",
        status: "queued",
        healthAtDispatch: project.health,
        ...(mode === "custom" && typeof body.prompt === "string"
          ? { customPrompt: body.prompt.slice(0, 5000) }
          : {}),
      },
    });
    return NextResponse.json({ dispatch });
  }

  if (body.op === "cloud-events") {
    const dispatchId =
      typeof body.dispatchId === "string" ? body.dispatchId : "";
    if (!dispatchId) {
      return NextResponse.json({ error: "dispatchId required" }, { status: 400 });
    }
    const events = await prisma.activityEvent.findMany({
      where: { details: { contains: `"dispatchId":"${dispatchId}"` } },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, summary: true, createdAt: true },
    });
    return NextResponse.json({ events });
  }

  if (body.op === "cloud-status") {
    const recent = await prisma.dispatch.findMany({
      where: { runtime: "cloud" },
      orderBy: { enqueuedAt: "desc" },
      take: 10,
      include: { outcome: true },
    });
    return NextResponse.json({ recent });
  }

  return NextResponse.json({ error: "Unknown op" }, { status: 400 });
}
