import type { NextRequest } from "next/server";
import { readQuarantineStatus } from "@/lib/webhook-spool";
import { requireLocalMode } from "@/lib/access";

/** Phase 46.1 — surface quarantined (malformed) webhook pings. */
export async function GET(request: NextRequest): Promise<Response> {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  return Response.json(readQuarantineStatus());
}
