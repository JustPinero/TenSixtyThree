import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { jsonError, requireAdmin } from "@/lib/access";

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  try {
    const lessons = await prisma.knowledgeLesson.findMany({
      orderBy: { discoveredAt: "desc" },
      include: {
        sourceProject: { select: { name: true, slug: true } },
      },
    });

    return NextResponse.json(lessons);
  } catch (error) {
    return jsonError(error, "knowledge");
  }
}
