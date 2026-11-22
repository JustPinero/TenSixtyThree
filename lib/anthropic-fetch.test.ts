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

describe("69.1 — the streaming Overseer caller retries before the first byte", () => {
  it("a 529 then a good stream succeeds; the stream is read once", async () => {
    const { defaultStreamingAnthropicCaller } = await import("./overseer-tools-streaming");
    const sse = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","model":"x","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join("");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("overloaded", { status: 529 }))
      .mockResolvedValueOnce(new Response(sse, { status: 200 }));
    const caller = defaultStreamingAnthropicCaller({
      apiKey: "sk-test",
      fetchImpl,
      retryDelayMs: 1,
    });
    const res = await caller({ model: "x", system: [], messages: [], tools: [], max_tokens: 10 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.content).toEqual([{ type: "text", text: "ok" }]);
  });
});
