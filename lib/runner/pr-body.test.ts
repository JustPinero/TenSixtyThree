/** 52.5 — PR title/body composition (pure). */
import { describe, it, expect } from "vitest";
import { composePr } from "./pr-body";

const BASE = {
  mode: "audit",
  dispatchId: "d-123",
  costUsd: 0.42,
  outcome: "success",
  signals: ["lesson"],
  events: [
    { summary: "[cloud audit] Read CLAUDE.md" },
    { summary: "[cloud audit] tool Bash" },
  ],
};

describe("composePr", () => {
  it("titles by mode and marks the dispatch id in the body", () => {
    const pr = composePr(BASE);
    expect(pr.title.toLowerCase()).toContain("audit");
    expect(pr.body).toContain("d-123");
  });

  it("reports cost, outcome, and signals", () => {
    const pr = composePr(BASE);
    expect(pr.body).toContain("$0.42");
    expect(pr.body).toContain("success");
    expect(pr.body).toContain("lesson");
  });

  it("summarizes the event trail but caps it", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      summary: `[cloud audit] step ${i}`,
    }));
    const pr = composePr({ ...BASE, events: many });
    expect(pr.body).toContain("step 79");
    expect(pr.body.split("\n").length).toBeLessThan(60);
  });

  it("handles a null cost and empty signals without printing junk", () => {
    const pr = composePr({ ...BASE, costUsd: null, signals: [], events: [] });
    expect(pr.body).not.toContain("null");
    expect(pr.body).not.toContain("undefined");
    expect(pr.body).toContain("d-123");
  });

  it("says the run is machine-generated and needs review", () => {
    expect(composePr(BASE).body.toLowerCase()).toContain("review");
  });
});
