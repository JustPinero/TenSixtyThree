// @vitest-environment jsdom
/** 75 — reminder controls have accessible names. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ReminderWidget } from "./reminder-widget";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReminderWidget a11y (75)", () => {
  it("the toggle reports expanded state and each dismiss button is named", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          {
            id: 1,
            message: "Check Atlas deploy",
            conditionType: "project-health",
            conditionValue: "atlas:healthy",
            projectSlug: "atlas",
            status: "pending",
          },
        ],
      })),
    );
    render(<ReminderWidget />);
    const toggle = await screen.findByRole("button", { name: /reminders/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("button", { name: "Dismiss reminder: Check Atlas deploy" }),
    ).toBeTruthy();
  });
});
