// @vitest-environment jsdom
/** 65.4 — the enqueue button cannot double-dispatch. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CloudDispatchPanel } from "./cloud-dispatch-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonRes(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

describe("CloudDispatchPanel", () => {
  it("a double click sends one request and the button stays disabled while the run is queued", async () => {
    let resolvePost: (v: unknown) => void = () => {};
    const fetchMock = vi.fn((url: string, init?: { method?: string }) => {
      if (init?.method === "POST") return new Promise((r) => (resolvePost = r));
      return Promise.resolve(jsonRes(200, { dispatch: { id: "d1", status: "queued", mode: "audit", costUsd: null, resultBranch: null, resultPrUrl: null, errorMessage: null }, outcome: null, events: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CloudDispatchPanel slug="p" hasRepo />);
    const button = screen.getByRole("button", { name: /dispatch to cloud/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === "POST")).toHaveLength(1);
    resolvePost(jsonRes(200, { dispatch: { id: "d1" } }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /run in progress/i }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
  });

  it("409 follows the run already in progress instead of showing an error", async () => {
    const fetchMock = vi.fn((url: string, init?: { method?: string }) =>
      Promise.resolve(
        init?.method === "POST"
          ? jsonRes(409, { error: "already", dispatchId: "d9" })
          : jsonRes(200, { dispatch: { id: "d9", status: "started", mode: "audit", costUsd: null, resultBranch: null, resultPrUrl: null, errorMessage: null }, outcome: null, events: [] }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<CloudDispatchPanel slug="p" hasRepo />);
    fireEvent.click(screen.getByRole("button", { name: /dispatch to cloud/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/dispatch/cloud/d9"));
    expect(screen.queryByText("already")).toBeNull();
  });
});
