/**
 * Phase 60.3 — one-shot backfill of ActivityEvent.dispatchId from legacy
 * details JSON. Safe to run repeatedly (fills NULLs only).
 *   pnpm exec tsx scripts/backfill-activity-dispatch-id.ts
 */
import { prisma } from "../lib/db";
import { backfillActivityDispatchIds } from "../lib/activity-dispatch-backfill";

backfillActivityDispatchIds(prisma)
  .then((n) => {
    console.log(`Backfilled dispatchId on ${n} activity event(s).`);
    return prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
