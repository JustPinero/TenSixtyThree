/** 65.5 — runner limits fail loudly. */
import { describe, it, expect } from "vitest";
import { parseRunnerConfig } from "./config";

describe("parseRunnerConfig", () => {
  it("defaults", () => {
    expect(parseRunnerConfig({})).toEqual({
      maxTurns: 40,
      maxBudgetUsd: 5,
      pollMs: 5000,
    });
  });

  it("NaN budget throws instead of removing the cap", () => {
    expect(() => parseRunnerConfig({ RUNNER_MAX_BUDGET_USD: "five" })).toThrow(
      /RUNNER_MAX_BUDGET_USD/,
    );
  });

  it("zero / negative / non-numeric turn limits throw", () => {
    for (const v of ["0", "-3", "lots"]) {
      expect(() => parseRunnerConfig({ RUNNER_MAX_TURNS: v })).toThrow(
        /RUNNER_MAX_TURNS/,
      );
    }
  });
});
