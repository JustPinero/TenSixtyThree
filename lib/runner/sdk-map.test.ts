/** 52.2 — Agent SDK message → RunnerMessage mapping (pure). */
import { describe, it, expect } from "vitest";
import { mapSdkMessage, composeCloudPrompt } from "./sdk-map";

describe("mapSdkMessage", () => {
  it("maps assistant text blocks", () => {
    const mapped = mapSdkMessage({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Working on it." },
          { type: "tool_use", id: "t1", name: "Read", input: { file: "a" } },
        ],
      },
    });
    expect(mapped).toEqual([
      { type: "assistant", text: "Working on it." },
      { type: "tool_use", name: "Read", input: { file: "a" } },
    ]);
  });

  it("maps the terminal result with cost/turns/usage", () => {
    const mapped = mapSdkMessage({
      type: "result",
      subtype: "success",
      total_cost_usd: 1.23,
      num_turns: 7,
      usage: { input_tokens: 10 },
    });
    expect(mapped).toEqual([
      {
        type: "result",
        subtype: "success",
        totalCostUsd: 1.23,
        numTurns: 7,
        usage: { input_tokens: 10 },
      },
    ]);
  });

  it("ignores system/user/unknown message types", () => {
    expect(mapSdkMessage({ type: "system", subtype: "init" })).toEqual([]);
    expect(mapSdkMessage({ type: "user" })).toEqual([]);
    expect(mapSdkMessage({ type: "mystery" })).toEqual([]);
  });
});

describe("composeCloudPrompt", () => {
  it("modes yield distinct instructions; custom passes through", () => {
    const auditPrompt = composeCloudPrompt("audit", null);
    const continuePrompt = composeCloudPrompt("continue", null);
    expect(auditPrompt).not.toBe(continuePrompt);
    expect(auditPrompt.toLowerCase()).toContain("audit");
    expect(continuePrompt.toLowerCase()).toContain("handoff");
    expect(composeCloudPrompt("custom", "Do the thing")).toContain(
      "Do the thing"
    );
    // custom with no prompt falls back to continue behavior
    expect(composeCloudPrompt("custom", null)).toBe(continuePrompt);
  });
});
