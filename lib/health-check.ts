/**
 * Phase 51.4 — health check behind GET /api/health.
 *
 * Structural HealthDb seam (rather than PrismaClient) so tests can hand in a
 * dead stub without casts; the real client satisfies it structurally.
 * Railway's healthcheck probes this anonymously, so the route stays outside
 * auth enforcement and the payload self-diagnoses bad deploys (missing env).
 */
import { validateHostedEnv } from "./env-manifest";

export interface HealthDb {
  $queryRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
}

export interface HealthResult {
  status: "ok" | "degraded";
  db: "up" | "down";
  httpStatus: 200 | 503;
  missingEnv: string[];
  warnings: string[];
}

export async function checkHealth(
  db: HealthDb,
  env: Record<string, string | undefined>,
): Promise<HealthResult> {
  const { missing, warnings } = validateHostedEnv(env);
  let dbUp = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbUp = false;
  }
  return {
    status: dbUp ? "ok" : "degraded",
    db: dbUp ? "up" : "down",
    httpStatus: dbUp ? 200 : 503,
    missingEnv: missing,
    warnings,
  };
}
