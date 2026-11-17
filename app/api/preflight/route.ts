import { NextResponse, NextRequest } from "next/server";
import { checkDispatchPreflight } from "@/lib/dispatch-preflight";
import { requireUser } from "@/lib/access";

/**
 * Phase 28 — surfaces the dispatch preflight result to the UI so
 * missing tools are obvious before a dispatch attempt instead of after.
 *
 * Thin wrapper around `checkDispatchPreflight()`. No-store so the badge
 * always reflects the live process state; PATH lookups are fast enough
 * that caching isn't worth the staleness risk.
 */
export async function GET(request: NextRequest) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  const result = await checkDispatchPreflight();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
