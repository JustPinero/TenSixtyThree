/**
 * 52.1 — pure fold of an Agent SDK message stream into lifecycle rows.
 *
 * The SDK's typed stream replaces log parsing: assistant/tool messages
 * become ActivityEvent summaries, the terminal `result` message becomes
 * the DispatchOutcome (cost, turns, outcome classification). Escalation
 * signals reuse the existing [NEEDS ATTENTION]/[LESSON] detector so
 * cloud runs feed the same downstream surfaces as local ones.
 */
import { detectEscalations } from "../escalation-detector";

export type RunnerMessage =
  | { type: "assistant"; text: string }
  | { type: "tool_use"; name: string; input: Record<string, unknown> }
  | {
      type: "result";
      subtype: string; // "success" | "error_max_turns" | ...
      totalCostUsd: number;
      numTurns: number;
      usage: Record<string, unknown>;
    };

export interface RunnerEvent {
  kind: "text" | "tool";
  summary: string;
}

export interface RunnerOutcome {
  status: "completed" | "failed";
  outcome: "success" | "attention-needed" | "unknown";
  signals: string[];
  costUsd: number | null;
  turns: number | null;
}

export interface FoldedRun {
  events: RunnerEvent[];
  outcome: RunnerOutcome;
}

const SUMMARY_MAX = 200;

export function foldRunnerMessages(messages: RunnerMessage[]): FoldedRun {
  const events: RunnerEvent[] = [];
  const signals = new Set<string>();
  let result: Extract<RunnerMessage, { type: "result" }> | null = null;

  for (const message of messages) {
    if (message.type === "assistant") {
      for (const signal of detectEscalations(message.text)) {
        signals.add(signal.type);
      }
      events.push({
        kind: "text",
        summary: message.text.slice(0, SUMMARY_MAX),
      });
    } else if (message.type === "tool_use") {
      events.push({
        kind: "tool",
        summary: `${message.name}: ${JSON.stringify(message.input).slice(0, SUMMARY_MAX)}`,
      });
    } else if (message.type === "result") {
      result = message;
    }
  }

  if (!result) {
    return {
      events,
      outcome: {
        status: "failed",
        outcome: "unknown",
        signals: [...signals],
        costUsd: null,
        turns: null,
      },
    };
  }

  const succeeded = result.subtype === "success";
  return {
    events,
    outcome: {
      status: succeeded ? "completed" : "failed",
      outcome: !succeeded
        ? "unknown"
        : signals.has("needs-attention")
          ? "attention-needed"
          : "success",
      signals: [...signals],
      costUsd: result.totalCostUsd,
      turns: result.numTurns,
    },
  };
}
