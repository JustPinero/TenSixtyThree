/**
 * Phase 69.1 — the client SSE reader must not lose or fake text no matter
 * where the network splits the byte stream (mid-frame, mid-line, mid
 * multi-byte character).
 */
import { describe, it, expect } from "vitest";
import { readSse, type SseEvent } from "./sse-client";

const FRAMES = [
  { event: "message_start", data: { type: "message_start" } },
  {
    event: "content_block_delta",
    data: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: "Héllo " },
    },
  },
  {
    event: "content_block_delta",
    data: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: "wörld — ✓" },
    },
  },
  {
    event: "content_block_delta",
    data: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: "\nline two" },
    },
  },
  { event: "message_stop", data: { type: "message_stop" } },
];

const RAW = FRAMES.map(
  (f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`,
).join("");
const BYTES = new TextEncoder().encode(RAW);

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    },
  });
}

async function collect(
  stream: ReadableStream<Uint8Array>,
): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  await readSse(stream, (e) => out.push(e));
  return out;
}

function textOf(events: SseEvent[]): string {
  return events
    .map((e) => {
      const d = e.data as { delta?: { text?: string } } | null;
      return d?.delta?.text ?? "";
    })
    .join("");
}

describe("readSse", () => {
  it("every split point yields identical events and text", async () => {
    const whole = await collect(streamOf([BYTES]));
    expect(whole.map((e) => e.event)).toEqual(FRAMES.map((f) => f.event));
    expect(textOf(whole)).toBe("Héllo wörld — ✓\nline two");
    for (let cut = 1; cut < BYTES.length; cut++) {
      const split = await collect(
        streamOf([BYTES.slice(0, cut), BYTES.slice(cut)]),
      );
      expect(split).toEqual(whole);
    }
  });

  it("byte-at-a-time delivery is still exact", async () => {
    const chunks = Array.from(BYTES, (b) => new Uint8Array([b]));
    expect(await collect(streamOf(chunks))).toEqual(
      await collect(streamOf([BYTES])),
    );
  });

  it("CRLF framing and a final frame without a trailing blank line are handled", async () => {
    const crlf = new TextEncoder().encode(
      'event: a\r\ndata: {"x":1}\r\n\r\nevent: b\r\ndata: {"x":2}',
    );
    const events = await collect(streamOf([crlf]));
    expect(events).toEqual([
      { event: "a", data: { x: 1 } },
      { event: "b", data: { x: 2 } },
    ]);
  });

  it("multi-line data fields are joined; unparseable data is passed as text", async () => {
    const raw = new TextEncoder().encode(
      "data: hello\ndata: there\n\ndata: {oops\n\n",
    );
    expect(await collect(streamOf([raw]))).toEqual([
      { event: "message", data: "hello\nthere" },
      { event: "message", data: "{oops" },
    ]);
  });
});
