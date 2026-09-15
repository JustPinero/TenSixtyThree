/**
 * 52.1 — cloud-dispatch claiming.
 *
 * Postgres has real concurrency (db.md): claims go through
 * FOR UPDATE SKIP LOCKED so parallel runners never double-claim, and a
 * stale-claim sweep requeues rows whose runner died mid-job (the cloud
 * counterpart of the local watchdog).
 */
import type { PrismaClient, Dispatch } from "@/app/generated/prisma/client";

export async function claimNextCloudDispatch(
  prisma: PrismaClient,
  runnerId: string,
): Promise<Dispatch | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Dispatch"
    SET "status" = 'started', "runnerId" = ${runnerId}, "startedAt" = NOW()
    WHERE "id" = (
      SELECT "id" FROM "Dispatch"
      WHERE "runtime" = 'cloud' AND "status" = 'queued'
      ORDER BY "enqueuedAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id"
  `;
  if (rows.length === 0) return null;
  return prisma.dispatch.findUnique({ where: { id: rows[0].id } });
}

/** Requeue cloud rows claimed longer than maxAgeMs ago with no completion. */
export async function requeueStaleClaims(
  prisma: PrismaClient,
  maxAgeMs: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = await prisma.dispatch.updateMany({
    where: {
      runtime: "cloud",
      status: "started",
      startedAt: { lt: cutoff },
    },
    data: { status: "queued", runnerId: null, startedAt: null },
  });
  return result.count;
}

/**
 * Bughunt 1.0 — lease renewal. A long job touches startedAt so the stale
 * sweep (elapsed-time only, no liveness signal) never requeues a job whose
 * runner is alive. Returns false when this runner no longer holds the claim.
 */
export async function heartbeat(
  prisma: PrismaClient,
  dispatchId: string,
  runnerId: string
): Promise<boolean> {
  const result = await prisma.dispatch.updateMany({
    where: { id: dispatchId, runnerId, status: "started" },
    data: { startedAt: new Date() },
  });
  return result.count === 1;
}

/**
 * Bughunt 1.0 — terminal writes are conditioned on still owning the claim,
 * so a runner that was requeued-and-reclaimed from under it cannot clobber
 * the winner's result. Returns false when the claim was lost.
 */
export async function finalizeIfOwned(
  prisma: PrismaClient,
  dispatchId: string,
  runnerId: string,
  data: {
    status: "completed" | "failed";
    costUsd?: number | null;
    errorMessage?: string;
    resultBranch?: string | null;
    resultPrUrl?: string | null;
  }
): Promise<boolean> {
  const result = await prisma.dispatch.updateMany({
    where: { id: dispatchId, runnerId, status: "started" },
    data: { ...data, completedAt: new Date() },
  });
  return result.count === 1;
}
