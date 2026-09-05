/**
 * 52.2 — one runner tick: sweep stale claims, claim a queued cloud
 * dispatch, execute it. scripts/runner.ts wraps this in a poll loop
 * with the real deps; tests drive it with fakes.
 */
import type { PrismaClient } from "@/app/generated/prisma/client";
import { claimNextCloudDispatch, requeueStaleClaims } from "./claim";
import { runClaimedDispatch, type RunnerDeps } from "./job";

const STALE_CLAIM_MS = 60 * 60_000;

export async function runnerTick(
  prisma: PrismaClient,
  runnerId: string,
  deps: RunnerDeps,
): Promise<boolean> {
  await requeueStaleClaims(prisma, STALE_CLAIM_MS);
  const dispatch = await claimNextCloudDispatch(prisma, runnerId);
  if (!dispatch) return false;
  await runClaimedDispatch(prisma, dispatch, deps);
  return true;
}
