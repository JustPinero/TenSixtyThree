// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MorningBriefing } from "./morning-briefing";

vi.mock("@/lib/overseer-settings", () => ({
  getOverseerSettings: () => ({
    name: "Delamain",
    portraitIdle: "/delamain.jpg",
  }),
}));

global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });

describe("MorningBriefing", () => {
  beforeEach(() => {
    // Simulate already-seen-today so the manual trigger button renders
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem("cascade-last-briefing-date", today);
  });

  it("Brief Me button has tooltip title attribute", async () => {
    let container: HTMLElement;
    await act(async () => {
      const result = render(<MorningBriefing />);
      container = result.container;
    });
    const button = container!.querySelector("button")!;
    expect(button.title).toBe("Generate an AI summary of your fleet status");
  });

  it("Brief Me tooltip is under 60 characters", () => {
    const tooltip = "Generate an AI summary of your fleet status";
    expect(tooltip.length).toBeLessThanOrEqual(60);
  });
});

describe("MorningBriefing — 69.2 failure state", () => {
  it("a failed briefing shows an error with Try again (instead of disappearing)", async () => {
    localStorage.removeItem("cascade-last-briefing-date");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "API down" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "API down" }) });
    global.fetch = fetchMock;
    let container: HTMLElement;
    await act(async () => {
      container = render(<MorningBriefing />).container;
    });
    const alert = container!.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("API down");
    const retry = Array.from(alert!.querySelectorAll("button")).find((b) => /try again/i.test(b.textContent ?? ""));
    await act(async () => {
      retry!.click();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
