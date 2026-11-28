// @vitest-environment jsdom
/** 75 — the quarantine banner never renders a refusal body as a count. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QuarantineBanner } from "./quarantine-banner";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QuarantineBanner (75)", () => {
  it("renders nothing for a 403 {error} body", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Local mode only" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<QuarantineBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe("");
  });

  it("still warns about real quarantined pings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ count: 2, path: "/spool/q.jsonl" }),
      })),
    );
    render(<QuarantineBanner />);
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /2 malformed webhook pings/,
    );
  });
});
