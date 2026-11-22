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

const RUN = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  status: "completed",
  mode: "audit",
  costUsd: 0.12,
  resultBranch: null,
  resultPrUrl: null,
  errorMessage: null,
  enqueuedAt: "2026-11-22T10:00:00Z",
  attempts: 1,
  cancelRequested: false,
  ...over,
});

describe("67.4 — cloud run history", () => {
  it("history comes from the server, so it renders after a remount", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.startsWith("/api/dispatch/cloud?projectSlug=")
          ? jsonRes(200, {
              runs: [
                RUN({ id: "d2", status: "failed", errorMessage: "Stopped: hit the turn limit after 40 turns." }),
                RUN({ id: "d1", resultBranch: "cloud/d1-1", resultPrUrl: "https://github.com/x/y/pull/3" }),
              ],
            })
          : jsonRes(404, {}),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = render(<CloudDispatchPanel slug="p" hasRepo />);
    await screen.findByText(/hit the turn limit/i);
    first.unmount();
    render(<CloudDispatchPanel slug="p" hasRepo />);
    expect(await screen.findByText(/hit the turn limit/i)).toBeTruthy();
    expect(screen.getByText(/cloud\/d1-1/)).toBeTruthy();
  });

  it("an active run in the history is followed after a remount", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.startsWith("/api/dispatch/cloud?projectSlug=")
          ? jsonRes(200, { runs: [RUN({ id: "d7", status: "started" })] })
          : jsonRes(200, { dispatch: RUN({ id: "d7", status: "started" }), outcome: null, events: [] }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<CloudDispatchPanel slug="p" hasRepo />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/dispatch/cloud/d7"));
  });

  it("timeout is terminal: polling stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const detail = vi.fn(() =>
        Promise.resolve(jsonRes(200, { dispatch: RUN({ id: "d3", status: "timeout" }), outcome: null, events: [] })),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url.startsWith("/api/dispatch/cloud?projectSlug=")
            ? Promise.resolve(jsonRes(200, { runs: [RUN({ id: "d3", status: "started" })] }))
            : detail(),
        ),
      );
      render(<CloudDispatchPanel slug="p" hasRepo />);
      await waitFor(() => expect(detail).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(20_000);
      expect(detail).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no polling while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const hidden = vi.spyOn(document, "hidden", "get");
    try {
      const detail = vi.fn(() =>
        Promise.resolve(jsonRes(200, { dispatch: RUN({ id: "d4", status: "started" }), outcome: null, events: [] })),
      );
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url.startsWith("/api/dispatch/cloud?projectSlug=")
            ? Promise.resolve(jsonRes(200, { runs: [RUN({ id: "d4", status: "started" })] }))
            : detail(),
        ),
      );
      render(<CloudDispatchPanel slug="p" hasRepo />);
      await waitFor(() => expect(detail).toHaveBeenCalledTimes(1));
      hidden.mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(20_000);
      expect(detail).toHaveBeenCalledTimes(1);
      hidden.mockReturnValue(false);
      document.dispatchEvent(new Event("visibilitychange"));
      await waitFor(() => expect(detail.mock.calls.length).toBeGreaterThan(1));
    } finally {
      hidden.mockRestore();
      vi.useRealTimers();
    }
  });

  it("a running job can be cancelled", async () => {
    const fetchMock = vi.fn((url: string, init?: { method?: string }) =>
      Promise.resolve(
        init?.method === "POST"
          ? jsonRes(200, { ok: true, cancelled: "requested" })
          : url.startsWith("/api/dispatch/cloud?projectSlug=")
            ? jsonRes(200, { runs: [RUN({ id: "d5", status: "started" })] })
            : jsonRes(200, { dispatch: RUN({ id: "d5", status: "started" }), outcome: null, events: [] }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<CloudDispatchPanel slug="p" hasRepo />);
    fireEvent.click(await screen.findByRole("button", { name: /cancel run/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/dispatch/cloud/d5/cancel",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
