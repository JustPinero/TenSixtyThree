/** 52.1 — pure SDKMessage-stream → lifecycle mapping. */
import { describe, it, expect } from "vitest";
import { foldRunnerMessages, type RunnerMessage } from "./lifecycle";

const STREAM: RunnerMessage[] = [
  { type: "assistant", text: "Reading the request file first." },
  { type: "tool_use", name: "Read", input: { file: "requests/1.md" } },
  { type: "tool_use", name: "Bash", input: { command: "pnpm test" } },
  { type: "assistant", text: "Tests green. [LESSON] pin the fixture clock." },
  {
    type: "result",
    subtype: "success",
    totalCostUsd: 0.42,
    numTurns: 9,
    usage: { input_tokens: 1000, output_tokens: 500 },
  },
];

describe("foldRunnerMessages", () => {
  it("produces an event per message and a success outcome with cost", () => {
    const folded = foldRunnerMessages(STREAM);
    expect(folded.events).toHaveLength(4); // result becomes the outcome
    expect(folded.events[1]).toMatchObject({
      kind: "tool",
      summary: expect.stringContaining("Read"),
    });
    expect(folded.outcome).toMatchObject({
      status: "completed",
      outcome: "success",
      costUsd: 0.42,
      turns: 9,
    });
  });

  it("collects escalation signals from assistant text", () => {
    const folded = foldRunnerMessages([
      { type: "assistant", text: "[NEEDS ATTENTION] migration is destructive" },
      {
        type: "result",
        subtype: "success",
        totalCostUsd: 0.1,
        numTurns: 2,
        usage: {},
      },
    ]);
    expect(folded.outcome.signals).toContain("needs-attention");
    expect(folded.outcome.outcome).toBe("attention-needed");
  });

  it("error results map to failed", () => {
    const folded = foldRunnerMessages([
      { type: "assistant", text: "starting" },
      {
        type: "result",
        subtype: "error_max_turns",
        totalCostUsd: 1.2,
        numTurns: 40,
        usage: {},
      },
    ]);
    expect(folded.outcome.status).toBe("failed");
    expect(folded.outcome.outcome).toBe("unknown");
  });

  it("a stream with no result yields a failed outcome (runner died)", () => {
    const folded = foldRunnerMessages([
      { type: "assistant", text: "starting" },
    ]);
    expect(folded.outcome.status).toBe("failed");
    expect(folded.outcome.costUsd).toBeNull();
  });
});
