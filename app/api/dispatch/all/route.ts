import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { isDemoSession } from "@/lib/demo";
import { dispatchAll, type DispatchMode } from "@/lib/claude-dispatcher";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limiter";
import { jsonError, requireLocalMode } from "@/lib/access";

export async function POST(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  // 54.5 — the sandbox never spawns real Claude Code sessions.
  {
    const demoSession = await getServerSession(prisma, request.headers);
    if (isDemoSession(demoSession)) {
      return NextResponse.json(
        { error: "Demo mode: dispatching is disabled in the sandbox." },
        { status: 403 },
      );
    }
  }
  const limited = checkRateLimit(getRateLimitKey(request, "dispatch-all"), 3, 60_000);
  if (limited) return limited;

  try {
    const { mode = "continue" } = await request.json();

    if (mode !== "continue" && mode !== "audit") {
      return NextResponse.json(
        { error: "Dispatch all only supports: continue, audit" },
        { status: 400 }
      );
    }

    const result = await dispatchAll(prisma, mode as DispatchMode);

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error, "dispatch.all");
  }
}
