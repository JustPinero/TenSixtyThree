import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, requireUser } from "@/lib/access";
import { activityWhere, scopeForViewer } from "@/lib/tenant-scope";

export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventType = searchParams.get("type");
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "20") || 20,
      100
    );

    // Phase 66.2 — only events on projects the viewer can see.
    const scope = await scopeForViewer(prisma, access.viewer);
    const where = {
      AND: [activityWhere(scope), eventType ? { eventType } : {}],
    };

    const events = await prisma.activityEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        project: {
          select: { name: true, slug: true },
        },
      },
    });

    return NextResponse.json(events);
  } catch (error) {
    return jsonError(error, "activity");
  }
}
