import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidSlug } from "@/lib/validators";
import { getRemainingWork } from "@/lib/work-reader";
import { jsonError, requireLocalMode } from "@/lib/access";

/**
 * GET /api/projects/[slug]/work
 *
 * Returns the structured remaining work for a project —
 * phases, requests, and their completion status.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  try {
    const { slug } = await params;
    if (!isValidSlug(slug)) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { slug },
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    const work = await getRemainingWork(
      project.path,
      project.currentPhase,
      project.currentRequest
    );

    return NextResponse.json(work);
  } catch (error) {
    return jsonError(error, "projects.[slug].work");
  }
}
