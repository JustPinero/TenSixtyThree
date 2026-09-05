/**
 * 52.2 — Agent SDK wire format → RunnerMessage (pure).
 *
 * The SDK yields typed messages; we keep only what the lifecycle fold
 * consumes (assistant text, tool_use, terminal result). Kept separate
 * from real-deps so the mapping is testable without the SDK installed.
 */
import type { RunnerMessage } from "./lifecycle";

interface SdkContentBlock {
  type: string;
  id?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface SdkWireMessage {
  type: string;
  subtype?: string;
  message?: { content?: SdkContentBlock[] };
  total_cost_usd?: number;
  num_turns?: number;
  usage?: Record<string, unknown>;
}

export function mapSdkMessage(message: SdkWireMessage): RunnerMessage[] {
  if (message.type === "assistant") {
    const out: RunnerMessage[] = [];
    for (const block of message.message?.content ?? []) {
      if (block.type === "text" && typeof block.text === "string") {
        out.push({ type: "assistant", text: block.text });
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        out.push({
          type: "tool_use",
          name: block.name,
          input: block.input ?? {},
        });
      }
    }
    return out;
  }
  if (message.type === "result") {
    return [
      {
        type: "result",
        subtype: message.subtype ?? "unknown",
        totalCostUsd: message.total_cost_usd ?? 0,
        numTurns: message.num_turns ?? 0,
        usage: message.usage ?? {},
      },
    ];
  }
  return [];
}

const CONTINUE_PROMPT = [
  "You are a dispatched TenSixtyThree cloud session for this repository.",
  "Read CLAUDE.md, then .claude/handoff.md and the newest request file",
  "under requests/, and continue the work exactly where the handoff",
  "leaves off, following the repo's action loop and TDD rules. Commit at",
  "logical checkpoints on a new branch. Tag anything a human must do",
  "with [HUMAN TODO] and anything blocking with [NEEDS ATTENTION].",
].join(" ");

const AUDIT_PROMPT = [
  "You are a dispatched TenSixtyThree cloud audit session for this",
  "repository. Run the phase-end audit checklist: test coverage and",
  "quality, bug hunt over recent changes, and doc drift between",
  "references/ and the code. Do NOT change production code — write",
  "findings to audits/, tag reusable insights with [LESSON] and blockers",
  "with [NEEDS ATTENTION].",
].join(" ");

const INVESTIGATE_PROMPT = [
  "You are a dispatched TenSixtyThree cloud investigation session. The",
  "project is blocked. Read .claude/handoff.md and recent logs, find the",
  "root cause, and either fix it (tests first) or document exactly what",
  "a human must decide, tagged [NEEDS ATTENTION].",
].join(" ");

export function composeCloudPrompt(
  mode: string,
  customPrompt: string | null,
): string {
  switch (mode) {
    case "audit":
      return AUDIT_PROMPT;
    case "investigate":
      return INVESTIGATE_PROMPT;
    case "custom":
      return customPrompt && customPrompt.trim()
        ? `${CONTINUE_PROMPT}\n\nOperator instructions: ${customPrompt.trim()}`
        : CONTINUE_PROMPT;
    default:
      return CONTINUE_PROMPT;
  }
}
