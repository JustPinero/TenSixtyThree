// @vitest-environment jsdom
/** Phase 72 — empty knowledge base: gaps are neutral ideas, not red alerts. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GapSuggestions } from "./gap-suggestions";

afterEach(() => cleanup());

const GAPS = [{ category: "testing", count: 0, suggestion: "Capture a testing lesson", priority: "high" as const }];

describe("GapSuggestions", () => {
  it("with lessons, gaps keep their priority", () => {
    render(<GapSuggestions suggestions={GAPS} />);
    expect(screen.getByText(/\[high\]/i)).toBeTruthy();
  });

  it("neutral (empty base): no [HIGH] tag, no danger styling", () => {
    const { container } = render(<GapSuggestions suggestions={GAPS} neutral />);
    expect(screen.queryByText(/\[high\]/i)).toBeNull();
    expect(screen.getByText(/ideas to start/i)).toBeTruthy();
    expect(container.innerHTML).not.toContain("text-danger");
  });
});
