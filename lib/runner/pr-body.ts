/**
 * 52.5 — PR title/body for a cloud run (pure).
 *
 * The PR is the human-facing artifact of an autonomous session, so the
 * body has to answer "what ran, what did it cost, what should I look
 * at" without opening the app. Event trail is capped — a 40-turn run
 * would otherwise bury the summary.
 */

export interface PrInput {
  mode: string;
  dispatchId: string;
  costUsd: number | null;
  outcome: string;
  signals: string[];
  events: { summary: string }[];
}

const EVENT_TAIL = 25;

const SIGNAL_LABELS: Record<string, string> = {
  "needs-attention": "⚠️ needs attention",
  lesson: "💡 lesson",
  "test-failure": "❌ test failure",
  "phase-complete": "✅ phase complete",
  "human-todo": "🙋 human todo",
};

export function composePr(input: PrInput): { title: string; body: string } {
  const title = `cloud ${input.mode}: automated session (${input.outcome})`;

  const lines: string[] = [
    `Automated cloud session — **${input.mode}** mode, dispatch \`${input.dispatchId}\`.`,
    "",
    `- Outcome: **${input.outcome}**`,
  ];
  if (input.costUsd !== null) {
    lines.push(`- Cost: **$${input.costUsd.toFixed(2)}**`);
  }
  if (input.signals.length > 0) {
    lines.push(
      `- Signals: ${input.signals
        .map((s) => SIGNAL_LABELS[s] ?? s)
        .join(", ")}`,
    );
  }

  if (input.events.length > 0) {
    const tail = input.events.slice(-EVENT_TAIL);
    lines.push(
      "",
      `<details><summary>Session trail (last ${tail.length} of ${input.events.length})</summary>`,
      "",
    );
    for (const event of tail) {
      lines.push(`- ${event.summary}`);
    }
    lines.push("", "</details>");
  }

  lines.push(
    "",
    "This branch was written by an autonomous agent — review it like any other PR before merging.",
  );

  return { title, body: lines.join("\n") };
}
