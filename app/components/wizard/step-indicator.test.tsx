// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StepIndicator } from "./step-indicator";

const STEPS = ["Name", "Stack", "Repo", "Config", "Claude", "Review", "Launch"];

describe("StepIndicator (Phase 71.3)", () => {
  it("shows a compact 'Step n of 7' line for phones, hidden from sm up", () => {
    const { container } = render(
      <StepIndicator steps={STEPS} currentStep={3} />,
    );
    const compact = container.querySelector("p");
    expect(compact?.textContent).toBe("Step 4 of 7 · Config");
    expect(compact?.className).toContain("sm:hidden");
  });

  it("keeps the full stepper, but only from sm up", () => {
    const { container } = render(
      <StepIndicator steps={STEPS} currentStep={0} />,
    );
    const full = container.querySelector("div");
    expect(full?.className).toContain("hidden sm:flex");
    expect(full?.textContent).toContain("Launch");
  });

  it("clamps a past-the-end step (the launch screen) to the last label", () => {
    const { container } = render(
      <StepIndicator steps={STEPS} currentStep={7} />,
    );
    expect(container.querySelector("p")?.textContent).toBe(
      "Step 7 of 7 · Launch",
    );
  });
});
