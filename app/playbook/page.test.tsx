// @vitest-environment jsdom
/** Phase 72 — a failed playbook save is reported, not shown as "Saved". */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PlaybookPage from "./page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("/playbook save", () => {
  it("shows the failure and never says Saved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "PUT"
          ? { ok: false, json: async () => ({ error: "Disk full" }) }
          : { ok: true, json: async () => ({ content: "- rule" }) },
      ),
    );
    render(<PlaybookPage />);
    fireEvent.click(await screen.findByRole("button", { name: /save playbook/i }));
    expect((await screen.findByRole("alert")).textContent).toContain("Disk full");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
