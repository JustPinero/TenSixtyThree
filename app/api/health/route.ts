/**
 * Phase 51.4 — GET /api/health (Railway healthcheck target).
 *
 * Intentionally unauthenticated: Railway probes it anonymously, and it must
 * answer even when auth or env is misconfigured — that is the point.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkHealth } from "@/lib/health-check";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await checkHealth(prisma, process.env);
  return NextResponse.json(
    {
      status: result.status,
      db: result.db,
      missingEnv: result.missingEnv,
      warnings: result.warnings,
    },
    { status: result.httpStatus },
  );
}
