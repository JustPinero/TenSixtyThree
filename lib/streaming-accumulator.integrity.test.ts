/**
 * Phase 69.1 — a stream that errored or was cut off must never become a
 * plausible-looking response, and a tool call whose input never closed
 * must never be executed.
 */
import { describe, it, expect } from "vitest";
import {
  applyStreamEvent,
  assembleResponse,
  createStreamAccumulator,
  type StreamEvent,
} from "./streaming-accumulator";

const START: StreamEvent = {
  type: "message_start",
  message: {
    id: "m1",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 0 },
  },
};

function run(events: unknown[]) {
  const state = createStreamAccumulator();
  for (const e of events) applyStreamEvent(state, e as StreamEvent);
  return assembleResponse(state);
}

describe("stream integrity", () => {
  it("a complete stream assembles", () => {
    const res = run([
      START,
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "hi" },
      },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
      { type: "message_stop" },
    ]);
    expect(res.content).toEqual([{ type: "text", text: "hi" }]);
    expect(res.stop_reason).toBe("end_turn");
  });

  it("an error frame throws", () => {
    expect(() =>
      run([
        START,
        {
          type: "error",
          error: { type: "overloaded_error", message: "Overloaded" },
        },
      ]),
    ).toThrow(/overloaded/i);
  });

  it("a stream that ends without message_stop throws (no half reply)", () => {
    expect(() =>
      run([
        START,
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "partial" },
        },
      ]),
    ).toThrow(/without message_stop|incomplete/i);
  });

  it("a tool_use whose input never closed is never returned for execution", () => {
    expect(() =>
      run([
        START,
        {
          type: "content_block_start",
          index: 0,
          content_block: {
            type: "tool_use",
            id: "t1",
            name: "propose_dispatch",
            input: {},
          },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"slug":"x' },
        },
        { type: "message_delta", delta: { stop_reason: "max_tokens" } },
        { type: "message_stop" },
      ]),
    ).toThrow(/tool_use|never closed/i);
  });

  it("redacted_thinking blocks are preserved verbatim", () => {
    const res = run([
      START,
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "redacted_thinking", data: "opaque==" },
      },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: { type: "text", text: "ok" },
      },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
      { type: "message_stop" },
    ]);
    expect(res.content).toEqual([
      { type: "redacted_thinking", data: "opaque==" },
      { type: "text", text: "ok" },
    ]);
  });
});
