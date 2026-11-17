import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { harvestKnowledge } from "@/lib/knowledge-harvester";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limiter";
import { jsonError, requireLocalMode } from "@/lib/access";

export async function POST(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  const limited = checkRateLimit(getRateLimitKey(request, "harvest"), 5, 60_000);
  if (limited) return limited;

  try {
    const result = await harvestKnowledge(prisma);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error, "knowledge.harvest");
  }
}
