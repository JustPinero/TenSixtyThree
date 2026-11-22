/**
 * 52.1 — execute one claimed cloud dispatch.
 *
 * Deps are injected (clone, agent stream, cleanup): tests drive fakes,
 * 52.2 supplies the real @anthropic-ai/claude-agent-sdk + git deps. The
 * SDK stream is folded (lib/runner/lifecycle.ts) into ActivityEvents +
 * a DispatchOutcome — the cloud equivalent of the local Stop-hook path.
 *
 * Phase 67 — a run can be stopped four ways, each with its own ending:
 *   interrupted (runner SIGTERM)   → requeued, or dead-lettered on the last attempt
 *   lost-claim  (heartbeat failed) → nothing: another runner owns the row
 *   timeout     (wall-clock limit) → status timeout, partial work pushed
 *   cancelled   (cancelRequested)  → failed "Cancelled", partial work pushed
 * and a thrown error pushes partial work too. Every terminal run that
 * still owns its row writes a DispatchOutcome (cost, turns) and feeds its
 * signals to the same writers local sessions use.
 */
import type { PrismaClient, Dispatch } from "@/app/generated/prisma/client";
import {
  foldRunnerMessages,
  type FoldedRun,
  type RunnerMessage,
} from "./lifecycle";
import { composePr } from "./pr-body";
import {
  heartbeat,
  finalizeIfOwned,
  isCancelRequested,
  requeueInterrupted,
} from "./claim";
import { cloudPermissionFor } from "./autonomy";
import { canDispatchProject } from "../project-access";
import { scrubSecrets } from "./scrub";
import { detectEscalations } from "../escalation-detector";
import { writeEscalationSignals } from "../session-signals";

const HEARTBEAT_MS = 5 * 60_000;
const CANCEL_POLL_MS = 15_000;
const DEFAULT_WALL_MS = 45 * 60_000;

export interface RunnerDeps {
  /** Clone the repo, return the working directory. */
  cloneRepo: (githubRepo: string) => Promise<string>;
  /** Stream agent messages for the dispatch running in workdir. Must stop
   *  (end or throw) once `signal` aborts. */
  runAgent: (args: {
    workdir: string;
    dispatch: Dispatch;
    signal?: AbortSignal;
  }) => AsyncGenerator<RunnerMessage>;
  /** Remove the working directory (always called). */
  cleanup: (workdir: string) => Promise<void>;
  /** 52.4 — publish the session's commits (if any) to a result branch.
   *  `partial` (67.3) labels work from a run that did not finish.
   *  Returns pushed:false when the tree left no commits. Failures never
   *  fail the run. */
  pushBranch?: (args: {
    workdir: string;
    dispatch: Dispatch;
    partial?: boolean;
  }) => Promise<{ pushed: boolean; branch: string | null; reason?: string }>;
  /** Review — claim-time re-check that the dispatching (non-admin) owner
   *  can still push to the repo; false fails the run before cloning. */
  verifyRepoAccess?: (args: { userId: string; githubRepo: string }) => Promise<boolean>;
  /** 52.5 — open a PR for the pushed branch; returns its url. Optional;
   *  failures never fail the run (the branch is still on the remote). */
  openPullRequest?: (args: {
    dispatch: Dispatch;
    branch: string;
    title: string;
    body: string;
  }) => Promise<string>;
}

export interface RunOptions {
  /** Runner shutdown (SIGTERM). */
  signal?: AbortSignal;
  heartbeatMs?: number;
  wallClockMs?: number;
  cancelPollMs?: number;
}

type StopReason = "interrupted" | "lost-claim" | "timeout" | "cancelled";

class CloneError extends Error {}

function describeLimit(ms: number): string {
  return ms >= 60_000
    ? `${Math.round(ms / 60_000)}-minute`
    : `${Math.max(1, Math.round(ms / 1000))}-second`;
}

export async function runClaimedDispatch(
  prisma: PrismaClient,
  dispatch: Dispatch,
  deps: RunnerDeps,
  opts: RunOptions = {},
): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: dispatch.projectId },
  });
  if (!project?.githubRepo) {
    await prisma.dispatch.update({
      where: { id: dispatch.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: "Project has no GitHub repo",
      },
    });
    return;
  }

  // 65.4 — re-check at claim time: autonomy may have flipped to manual,
  // or the owner may have lost the right to drive this project, while
  // the row sat in the queue.
  const permission = cloudPermissionFor(project.autonomyMode);
  const stillAllowed =
    dispatch.ownerUserId !== null &&
    (await canDispatchProject(prisma, dispatch.ownerUserId, project.id));
  if (!permission.allowed || !stillAllowed) {
    await finalizeIfOwned(prisma, dispatch.id, dispatch.runnerId ?? "", {
      status: "failed",
      errorMessage: permission.allowed
        ? "The dispatching user can no longer run this project"
        : permission.reason,
    });
    return;
  }

  const runnerId = dispatch.runnerId ?? "";

  // Review — push access was checked at enqueue, but a row can wait in the
  // queue; re-check before the runner touches the repo with its token.
  if (deps.verifyRepoAccess && dispatch.ownerUserId) {
    const owner = await prisma.user.findUnique({
      where: { id: dispatch.ownerUserId },
      select: { role: true },
    });
    if (owner?.role !== "admin") {
      const ok = await deps
        .verifyRepoAccess({ userId: dispatch.ownerUserId, githubRepo: project.githubRepo })
        .catch(() => false);
      if (!ok) {
        await finalizeIfOwned(prisma, dispatch.id, runnerId, {
          status: "failed",
          errorMessage: "The dispatching user no longer has push access to this repository.",
        });
        return;
      }
    }
  }

  const wallMs = opts.wallClockMs ?? DEFAULT_WALL_MS;
  const stop = new AbortController();
  let reason: StopReason | null = null;
  const halt = (why: StopReason) => {
    if (reason) return;
    reason = why;
    stop.abort(why);
  };

  const onShutdown = () => halt("interrupted");
  if (opts.signal?.aborted) halt("interrupted");
  opts.signal?.addEventListener("abort", onShutdown);

  // Bughunt 1.0: renew the lease while working. 67.2: a failed renewal
  // means another runner owns the row — stop, and publish nothing.
  const lease = setInterval(() => {
    heartbeat(prisma, dispatch.id, runnerId)
      .then((owned) => {
        if (!owned) halt("lost-claim");
      })
      .catch(() => {});
  }, opts.heartbeatMs ?? HEARTBEAT_MS);
  const cancelPoll = setInterval(() => {
    isCancelRequested(prisma, dispatch.id)
      .then((cancel) => {
        if (cancel) halt("cancelled");
      })
      .catch(() => {});
  }, opts.cancelPollMs ?? CANCEL_POLL_MS);
  const wall = setTimeout(() => halt("timeout"), wallMs);

  let workdir: string | null = null;
  const messages: RunnerMessage[] = [];

  /** Partial work from an unfinished run — never fails the run. */
  async function pushPartial(): Promise<string | null> {
    if (!workdir || !deps.pushBranch) return null;
    try {
      const pushed = await deps.pushBranch({
        workdir,
        dispatch,
        partial: true,
      });
      return pushed.pushed ? pushed.branch : null;
    } catch (pushError) {
      console.warn(
        `[runner] partial push failed for ${dispatch.id}:`,
        scrubSecrets(
          pushError instanceof Error ? pushError.message : String(pushError),
        ),
      );
      return null;
    }
  }

  /** Outcome row + signals, for every run that still owns its row. */
  async function record(folded: FoldedRun): Promise<void> {
    try {
      await prisma.dispatchOutcome.create({
        data: {
          projectId: dispatch.projectId,
          projectSlug: dispatch.projectSlug,
          mode: dispatch.mode,
          healthAtDispatch: dispatch.healthAtDispatch ?? "idle",
          outcome: folded.outcome.outcome,
          signals: JSON.stringify(folded.outcome.signals),
          dispatchedAt: dispatch.enqueuedAt,
          dispatchId: dispatch.id,
          costUsd: folded.outcome.costUsd,
          turns: folded.outcome.turns,
        },
      });
    } catch (err) {
      console.error(`[runner] outcome write failed for ${dispatch.id}:`, err);
    }
    // Security review: agent text can echo secrets — scrub every signal
    // before it lands in a task title, lesson or event summary.
    const signals = messages
      .flatMap((m) => (m.type === "assistant" ? detectEscalations(m.text) : []))
      .map((signal) => ({ ...signal, message: scrubSecrets(signal.message) }));
    await writeEscalationSignals(
      prisma,
      {
        projectId: dispatch.projectId,
        projectSlug: dispatch.projectSlug,
        ownerUserId: dispatch.ownerUserId,
        dedupTasks: true,
        writeLessons: true,
        summaryPrefix: `[cloud ${dispatch.mode}]`,
      },
      signals,
    );
  }

  /** Ending for a run stopped by `why`. */
  async function endStopped(
    why: StopReason,
    extra?: { costUsd?: number },
  ): Promise<void> {
    if (why === "lost-claim") {
      console.warn(
        `[runner] lost claim on ${dispatch.id} — stopped, nothing published`,
      );
      return;
    }
    if (why === "interrupted") {
      await requeueInterrupted(prisma, dispatch, runnerId);
      return;
    }
    const resultBranch = await pushPartial();
    const partialNote = resultBranch
      ? ` Partial work pushed to ${resultBranch}.`
      : "";
    const folded = foldRunnerMessages(messages);
    const owned = await finalizeIfOwned(prisma, dispatch.id, runnerId, {
      status: why === "timeout" ? "timeout" : "failed",
      errorMessage:
        why === "timeout"
          ? `Stopped: ran past the ${describeLimit(wallMs)} time limit.${partialNote}`
          : `Cancelled by request.${partialNote}`,
      costUsd: extra?.costUsd ?? folded.outcome.costUsd,
      resultBranch,
    });
    if (owned) await record(folded);
  }

  try {
    try {
      workdir = await deps.cloneRepo(project.githubRepo);
    } catch (cloneError) {
      throw new CloneError(
        cloneError instanceof Error ? cloneError.message : String(cloneError),
      );
    }

    if (!reason) {
      const iterator = deps
        .runAgent({ workdir, dispatch, signal: stop.signal })
        [Symbol.asyncIterator]();
      const stopped = new Promise<"stop">((resolve) => {
        if (stop.signal.aborted) resolve("stop");
        stop.signal.addEventListener("abort", () => resolve("stop"));
      });
      for (;;) {
        const next = iterator.next();
        next.catch(() => {}); // a rejection after we stopped is expected
        const step = await Promise.race([next, stopped]);
        if (step === "stop") {
          iterator.return?.(undefined).catch(() => {});
          break;
        }
        if (step.done) break;
        const message = step.value;
        messages.push(message);
        // Stream visibility as it happens, not only at the end.
        if (message.type === "assistant" || message.type === "tool_use") {
          await prisma.activityEvent.create({
            data: {
              projectId: dispatch.projectId,
              // 66.2: progress is not a session end (no chime).
              eventType: "cloud-progress",
              dispatchId: dispatch.id,
              summary: scrubSecrets(
                `[cloud ${dispatch.mode}] ${
                  message.type === "assistant"
                    ? message.text.slice(0, 180)
                    : `tool ${message.name}`
                }`,
              ),
              details: JSON.stringify({ dispatchId: dispatch.id }),
            },
          });
        }
      }
    }

    if (reason) {
      await endStopped(reason);
      return;
    }

    // 52.4 — publish work product before the workdir evaporates.
    let resultBranch: string | null = null;
    if (deps.pushBranch) {
      try {
        const pushed = await deps.pushBranch({ workdir, dispatch });
        if (pushed.pushed) resultBranch = pushed.branch;
        else if (pushed.reason) {
          console.warn(
            `[runner] push skipped for ${dispatch.id}: ${pushed.reason}`,
          );
          await prisma.activityEvent.create({
            data: {
              projectId: dispatch.projectId,
              eventType: "cloud-progress",
              dispatchId: dispatch.id,
              summary: scrubSecrets(
                `[cloud ${dispatch.mode}] ${pushed.reason}`,
              ),
              details: JSON.stringify({ dispatchId: dispatch.id }),
            },
          });
        }
      } catch (pushError) {
        console.warn(
          `[runner] push failed for ${dispatch.id}:`,
          scrubSecrets(
            pushError instanceof Error ? pushError.message : String(pushError),
          ),
        );
      }
    }

    const folded = foldRunnerMessages(messages);

    // 52.5 — a pushed branch becomes a reviewable PR (fenced: not if we
    // lost the claim while pushing).
    let resultPrUrl: string | null = null;
    // Review: only a LOST CLAIM fences publishing here — a cancel or
    // timeout that lands after the agent already finished doesn't undo
    // finished work (the run is recorded as completed below).
    if (resultBranch && deps.openPullRequest && reason !== "lost-claim") {
      try {
        const pr = composePr({
          mode: dispatch.mode,
          dispatchId: dispatch.id,
          costUsd: folded.outcome.costUsd,
          outcome: folded.outcome.outcome,
          signals: folded.outcome.signals,
          events: folded.events,
        });
        resultPrUrl = await deps.openPullRequest({
          dispatch,
          branch: resultBranch,
          title: pr.title,
          body: pr.body,
        });
      } catch (prError) {
        console.warn(
          `[runner] PR failed for ${dispatch.id}:`,
          scrubSecrets(
            prError instanceof Error ? prError.message : String(prError),
          ),
        );
      }
    }

    const owned = await finalizeIfOwned(prisma, dispatch.id, runnerId, {
      status: folded.outcome.status,
      costUsd: folded.outcome.costUsd,
      resultBranch,
      resultPrUrl,
      ...(folded.outcome.errorMessage
        ? { errorMessage: folded.outcome.errorMessage }
        : {}),
    });
    if (!owned) {
      console.warn(
        `[runner] lost claim on ${dispatch.id} before finalize — result discarded`,
      );
      return;
    }
    await record(folded);
  } catch (error) {
    // 65.1 — git/SDK/fetch errors echo URLs and headers; scrub before storing.
    const raw = scrubSecrets(
      error instanceof Error ? error.message : String(error),
    );
    // Budget stops kill the process instead of yielding a result message —
    // salvage the spend so cost accounting stays honest (round-4 lesson).
    const budgetMatch = raw.match(/Budget limit reached \(\$([\d.]+)/);
    const costUsd = budgetMatch ? Number(budgetMatch[1]) : undefined;

    if (reason) {
      await endStopped(reason, costUsd !== undefined ? { costUsd } : undefined);
      return;
    }

    const message = error instanceof CloneError ? `Clone failed: ${raw}` : raw;
    // 67.3 — keep what the agent did manage to do.
    const resultBranch =
      error instanceof CloneError ? null : await pushPartial();
    const folded = foldRunnerMessages(messages);
    const owned = await finalizeIfOwned(prisma, dispatch.id, runnerId, {
      status: "failed",
      errorMessage: (resultBranch
        ? `${message} (partial work pushed to ${resultBranch})`
        : message
      ).slice(0, 1000),
      resultBranch,
      ...(costUsd !== undefined ? { costUsd } : {}),
    });
    if (owned) {
      await record({
        ...folded,
        outcome: {
          ...folded.outcome,
          costUsd: costUsd ?? folded.outcome.costUsd,
        },
      });
    }
  } finally {
    clearInterval(lease);
    clearInterval(cancelPoll);
    clearTimeout(wall);
    opts.signal?.removeEventListener("abort", onShutdown);
    if (workdir) await deps.cleanup(workdir);
  }
}
