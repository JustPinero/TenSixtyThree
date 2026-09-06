/**
 * 52.1 — execute one claimed cloud dispatch.
 *
 * Deps are injected (clone, agent stream, cleanup): tests drive fakes,
 * 52.2 supplies the real @anthropic-ai/claude-agent-sdk + git deps. The
 * SDK stream is folded (lib/runner/lifecycle.ts) into ActivityEvents +
 * a DispatchOutcome — the cloud equivalent of the local Stop-hook path.
 */
import type { PrismaClient, Dispatch } from "@/app/generated/prisma/client";
import { foldRunnerMessages, type RunnerMessage } from "./lifecycle";

export interface RunnerDeps {
  /** Clone the repo, return the working directory. */
  cloneRepo: (githubRepo: string) => Promise<string>;
  /** Stream agent messages for the dispatch running in workdir. */
  runAgent: (args: {
    workdir: string;
    dispatch: Dispatch;
  }) => AsyncGenerator<RunnerMessage>;
  /** Remove the working directory (always called). */
  cleanup: (workdir: string) => Promise<void>;
  /** 52.4 — publish the session's commits (if any) to a result branch.
   *  Returns pushed:false when the tree left no commits. Optional so
   *  older tests/deps keep working; failures never fail the run. */
  pushBranch?: (args: {
    workdir: string;
    dispatch: Dispatch;
  }) => Promise<{ pushed: boolean; branch: string | null }>;
}

export async function runClaimedDispatch(
  prisma: PrismaClient,
  dispatch: Dispatch,
  deps: RunnerDeps,
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

  let workdir: string | null = null;
  const messages: RunnerMessage[] = [];
  try {
    workdir = await deps.cloneRepo(project.githubRepo);
    for await (const message of deps.runAgent({ workdir, dispatch })) {
      messages.push(message);
      // Stream visibility as it happens, not only at the end.
      if (message.type === "assistant" || message.type === "tool_use") {
        await prisma.activityEvent.create({
          data: {
            projectId: dispatch.projectId,
            eventType: "session-complete",
            summary: `[cloud ${dispatch.mode}] ${
              message.type === "assistant"
                ? message.text.slice(0, 180)
                : `tool ${message.name}`
            }`,
            details: JSON.stringify({ dispatchId: dispatch.id }),
          },
        });
      }
    }

    // 52.4 — publish work product before the workdir evaporates.
    let resultBranch: string | null = null;
    if (deps.pushBranch) {
      try {
        const pushed = await deps.pushBranch({ workdir, dispatch });
        if (pushed.pushed) resultBranch = pushed.branch;
      } catch (pushError) {
        console.warn(
          `[runner] push failed for ${dispatch.id}:`,
          pushError instanceof Error ? pushError.message : pushError,
        );
      }
    }

    const folded = foldRunnerMessages(messages);
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
      },
    });
    await prisma.dispatch.update({
      where: { id: dispatch.id },
      data: {
        status: folded.outcome.status,
        completedAt: new Date(),
        costUsd: folded.outcome.costUsd,
        resultBranch,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Budget stops kill the process instead of yielding a result message —
    // salvage the spend so cost accounting stays honest (round-4 lesson).
    const budgetMatch = message.match(/Budget limit reached \(\$([\d.]+)/);
    await prisma.dispatch.update({
      where: { id: dispatch.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorMessage: message.slice(0, 1000),
        ...(budgetMatch ? { costUsd: Number(budgetMatch[1]) } : {}),
      },
    });
  } finally {
    if (workdir) await deps.cleanup(workdir);
  }
}
