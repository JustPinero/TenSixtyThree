import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { detectKnowledgeGaps } from "@/lib/knowledge-gaps";
import { jsonError, requireAdmin } from "@/lib/access";

export async function GET(request: NextRequest) {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  try {
    const gaps = await detectKnowledgeGaps(prisma);
    return NextResponse.json(gaps);
  } catch (error) {
    return jsonError(error, "knowledge.gaps");
  }
}
