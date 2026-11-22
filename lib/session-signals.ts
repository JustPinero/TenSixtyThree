/**
 * Phase 67.3 — one writer for escalation signals, local and cloud.
 *
 * Local sessions reach this from the Stop-hook webhook (signals parsed
 * from the session log); cloud runs reach it from the runner (signals
 * parsed from the agent's assistant messages). Same rows either way:
 * [HUMAN TODO] → HumanTask, every signal → an ActivityEvent, and — for
 * cloud runs, which have no handoff file for the harvester to read —
 * [LESSON] → KnowledgeLesson.
 *
 * Each write is guarded: losing one signal row must never abort the
 * caller's terminal bookkeeping ([41.D4]).
 */
import type { PrismaClient } from "@/app/generated/prisma/client";
import type { EscalationSignal } from "./escalation-detector";
import { categorize } from "./categorizer";

const EVENT_TYPE: Record<EscalationSignal["type"], string> = {
  "needs-attention": "blocker-detected",
  lesson: "lesson-harvested",
  "test-failure": "blocker-detected",
  "phase-complete": "phase-complete",
  "human-todo": "blocker-detected",
};

export interface SignalTarget {
  projectId: number;
  projectSlug: string;
  /** Who the resulting task belongs to (66.2); null = operator fleet. */
  ownerUserId?: string | null;
  /** Dedup HumanTasks on (projectSlug, title) — true when a dispatch is in scope. */
  dedupTasks?: boolean;
  /** Write [LESSON] signals as KnowledgeLesson rows (cloud runs). */
  writeLessons?: boolean;
  /** Prefix for ActivityEvent summaries, e.g. "[cloud audit]". */
  summaryPrefix?: string;
}

export async function writeEscalationSignals(
  prisma: PrismaClient,
  target: SignalTarget,
  signals: EscalationSignal[],
): Promise<void> {
  for (const signal of signals) {
    try {
      if (signal.type === "human-todo") {
        const existing = target.dedupTasks
          ? await prisma.humanTask.findFirst({
              where: { projectSlug: target.projectSlug, title: signal.message },
              select: { id: true },
            })
          : null;
        if (!existing) {
          await prisma.humanTask.create({
            data: {
              title: signal.message,
              projectId: target.projectId,
              projectSlug: target.projectSlug,
              createdBy: "claude",
              ownerUserId: target.ownerUserId ?? null,
            },
          });
        }
      }

      if (signal.type === "lesson" && target.writeLessons) {
        const title = signal.message.slice(0, 120);
        const existing = await prisma.knowledgeLesson.findFirst({
          where: { title, sourceProjectId: target.projectId },
          select: { id: true },
        });
        if (!existing) {
          const { category, tags } = categorize(title, signal.message);
          await prisma.knowledgeLesson.create({
            data: {
              title,
              content: signal.message,
              category,
              tags: JSON.stringify(tags),
              sourceProjectId: target.projectId,
              sourceFile: "cloud-run",
            },
          });
        }
      }

      await prisma.activityEvent.create({
        data: {
          projectId: target.projectId,
          eventType: EVENT_TYPE[signal.type] ?? signal.type,
          summary: `${target.summaryPrefix ? `${target.summaryPrefix} ` : ""}[${signal.type}] ${signal.message}`,
        },
      });
    } catch (err) {
      console.error("[session-signals] signal write failed (non-fatal):", err);
    }
  }
}
