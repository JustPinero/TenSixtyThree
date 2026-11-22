/**
 * 52.1 — cloud-dispatch claiming.
 *
 * Postgres has real concurrency (db.md): claims go through
 * FOR UPDATE SKIP LOCKED so parallel runners never double-claim, and a
 * stale-claim sweep requeues rows whose runner died mid-job (the cloud
 * counterpart of the local watchdog).
 */
import type { PrismaClient, Dispatch } from "@/app/generated/prisma/client";

/** 67.2 — a job gets this many claims before it is dead-lettered. */
export const MAX_ATTEMPTS = 3;

export function deadLetterMessage(reason: string): string {
  return `Gave up after ${MAX_ATTEMPTS} attempts (${reason}).`;
}

export async function claimNextCloudDispatch(
  prisma: PrismaClient,
  runnerId: string,
): Promise<Dispatch | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Dispatch"
    SET "status" = 'started', "runnerId" = ${runnerId}, "startedAt" = NOW(),
        "attempts" = "attempts" + 1
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
  const stale = { runtime: "cloud", status: "started", startedAt: { lt: cutoff } };
  // 67.2 — a job that has already used its last claim is dead-lettered,
  // not requeued forever.
  await prisma.dispatch.updateMany({
    where: { ...stale, attempts: { gte: MAX_ATTEMPTS } },
    data: {
      status: "failed",
      completedAt: new Date(),
      errorMessage: deadLetterMessage("the runner stopped responding each time"),
    },
  });
  const result = await prisma.dispatch.updateMany({
    where: stale,
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
    status: "completed" | "failed" | "timeout";
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

/**
 * 67.1 — the runner is shutting down (SIGTERM on deploy) mid-job. Put the
 * row back in the queue for the next runner, or dead-letter it when this
 * was the last attempt. Conditioned on still owning the claim.
 */
export async function requeueInterrupted(
  prisma: PrismaClient,
  dispatch: Pick<Dispatch, "id" | "attempts">,
  runnerId: string,
): Promise<boolean> {
  const owned = { id: dispatch.id, runnerId, status: "started" };
  if (dispatch.attempts >= MAX_ATTEMPTS) {
    const r = await prisma.dispatch.updateMany({
      where: owned,
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: deadLetterMessage("interrupted by runner restarts"),
      },
    });
    return r.count === 1;
  }
  const r = await prisma.dispatch.updateMany({
    where: owned,
    data: {
      status: "queued",
      runnerId: null,
      startedAt: null,
      errorMessage: `Interrupted by a runner restart; requeued (attempt ${dispatch.attempts} of ${MAX_ATTEMPTS}).`,
    },
  });
  return r.count === 1;
}

/** 67.2 — has someone asked to cancel this run? */
export async function isCancelRequested(
  prisma: PrismaClient,
  dispatchId: string,
): Promise<boolean> {
  const row = await prisma.dispatch.findUnique({
    where: { id: dispatchId },
    select: { cancelRequested: true },
  });
  return row?.cancelRequested === true;
}
