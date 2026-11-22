/**
 * Phase 60.3 [1.0.D4] — copy the dispatch id out of legacy ActivityEvent
 * `details` JSON into the indexed `dispatchId` column (66.2). Only fills
 * NULL columns, only for ids that are real Dispatch rows; idempotent.
 * Run once on hosted after deploy: `pnpm exec tsx scripts/backfill-activity-dispatch-id.ts`.
 * Readers keep the details fallback, so the app is correct before AND
 * after this runs — it only makes the lookup use the index.
 */
import type { PrismaClient } from "@/app/generated/prisma/client";

export async function backfillActivityDispatchIds(
  prisma: PrismaClient,
): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "ActivityEvent" AS e
    SET "dispatchId" = d."id"
    FROM "Dispatch" AS d
    WHERE e."dispatchId" IS NULL
      AND e."details" LIKE '%"dispatchId":"%'
      AND d."id" = substring(e."details" from '"dispatchId":"([^"]+)"')
  `;
}
