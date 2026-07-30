/**
 * Phase 47.2 (partial) — retry/backoff for non-streaming Anthropic calls.
 */
import { describe, it, expect, vi } from "vitest";
import { postAnthropicWithRetry } from "./anthropic-fetch";

function res(status: number, body = "{}"): Response {
  return new Response(body, { status });
}

describe("postAnthropicWithRetry", () => {
  it("returns immediately on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, '{"ok":true}'));
    const r = await postAnthropicWithRetry(
      { model: "m" },
      { apiKey: "k", fetchImpl, retryDelayMs: 1 }
    );
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries 429 and 529 up to twice, then returns the last response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(429))
      .mockResolvedValueOnce(res(529))
      .mockResolvedValueOnce(res(200));
    const r = await postAnthropicWithRetry(
      { model: "m" },
      { apiKey: "k", fetchImpl, retryDelayMs: 1 }
    );
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry 400s", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(400));
    const r = await postAnthropicWithRetry(
      { model: "m" },
      { apiKey: "k", fetchImpl, retryDelayMs: 1 }
    );
    expect(r.status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries network errors and surfaces the final failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      postAnthropicWithRetry({ model: "m" }, { apiKey: "k", fetchImpl, retryDelayMs: 1 })
    ).rejects.toThrow(/ECONNRESET/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry after the caller aborts", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error("aborted by test"));
    });
    await expect(
      postAnthropicWithRetry(
        { model: "m" },
        { apiKey: "k", fetchImpl, retryDelayMs: 1, signal: controller.signal }
      )
    ).rejects.toThrow(/aborted by test/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
