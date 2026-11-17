/**
 * Phase 65.1 — what a dispatch row may reveal over the API. An explicit
 * allowlist: no idempotencyKey (the webhook correlation handle), no
 * runnerId, no prompt snapshot, and the error text scrubbed + truncated.
 */
import { scrubSecrets } from "./scrub";

export const PUBLIC_DISPATCH_SELECT = {
  id: true,
  projectSlug: true,
  mode: true,
  status: true,
  runtime: true,
  enqueuedAt: true,
  startedAt: true,
  completedAt: true,
  costUsd: true,
  resultBranch: true,
  resultPrUrl: true,
  errorMessage: true,
} as const;

export interface PublicDispatch {
  id: string;
  projectSlug: string;
  mode: string;
  status: string;
  runtime: string;
  enqueuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  costUsd: number | null;
  resultBranch: string | null;
  resultPrUrl: string | null;
  errorMessage: string | null;
}

export function publicDispatch(d: PublicDispatch): PublicDispatch {
  return {
    id: d.id,
    projectSlug: d.projectSlug,
    mode: d.mode,
    status: d.status,
    runtime: d.runtime,
    enqueuedAt: d.enqueuedAt,
    startedAt: d.startedAt,
    completedAt: d.completedAt,
    costUsd: d.costUsd,
    resultBranch: d.resultBranch,
    resultPrUrl: d.resultPrUrl,
    errorMessage: d.errorMessage ? scrubSecrets(d.errorMessage).slice(0, 300) : null,
  };
}
