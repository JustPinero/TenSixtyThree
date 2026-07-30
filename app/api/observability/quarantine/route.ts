import { readQuarantineStatus } from "@/lib/webhook-spool";

/** Phase 46.1 — surface quarantined (malformed) webhook pings. */
export async function GET(): Promise<Response> {
  return Response.json(readQuarantineStatus());
}
