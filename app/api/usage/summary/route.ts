import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getAppKeySpendByUser, getUsageSummary } from "@/lib/observability/usage-summary";
import { requireUser } from "@/lib/access";

/**
 * Phase 39 [P8] — today's Anthropic spend for the dashboard cost
 * widget. "Today" is the server's local midnight.
 *
 * Phase 70 — per viewer: a user sees their own calls (BYOK and app key);
 * the local operator and admins see the fleet plus app-key spend broken
 * down by user.
 */
export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const viewer = access.viewer;
  const operator = viewer.kind === "local" || (viewer.isAdmin && !viewer.isDemo);
  const body = operator
    ? {
        scope: "fleet" as const,
        ...(await getUsageSummary(prisma, { since: midnight })),
        appKeyByUser: await getAppKeySpendByUser(prisma, { since: midnight }),
      }
    : {
        scope: "mine" as const,
        ...(await getUsageSummary(prisma, { since: midnight, userId: viewer.userId })),
      };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
