import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { TOUR_STEPS } from "./tour-steps";

const KNOWN_ROUTES = ["/", "/team", "/boards", "/roadmap", "/settings"];

describe("TOUR_STEPS", () => {
  it("has at least 6 well-formed steps with unique ids", () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(TOUR_STEPS.map((s) => s.id));
    expect(ids.size).toBe(TOUR_STEPS.length);
    for (const step of TOUR_STEPS) {
      expect(step.selector.length).toBeGreaterThan(0);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.text.length).toBeGreaterThan(10);
      expect(KNOWN_ROUTES).toContain(step.route);
    }
  });

  it("every anchor id exists in the source file the step names (drift guard)", () => {
    for (const step of TOUR_STEPS) {
      if (!step.selector.startsWith("#")) continue;
      const source = readFileSync(
        path.resolve(__dirname, "..", step.anchorFile),
        "utf-8",
      );
      expect(
        source.includes(step.selector.slice(1)),
        `${step.anchorFile} is missing ${step.selector}`,
      ).toBe(true);
    }
  });
});
