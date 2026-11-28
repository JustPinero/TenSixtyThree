import { DEFAULT_CHAT_MODEL } from "@/lib/model-config";

/**
 * Build an SSE-formatted ReadableStream that emits a single static
 * Markdown payload as one assistant message. Matches the Anthropic
 * streaming envelope so the existing chat client UX (which expects
 * SSE) renders this without any client changes.
 *
 * `model` and message id default to honest values that reflect the
 * caller (not the original feature-check leftover).
 */
export function sseFromText(
  text: string,
  options: { model?: string; messageId?: string } = {},
): ReadableStream<Uint8Array> {
  const model = options.model ?? DEFAULT_CHAT_MODEL;
  const messageId = options.messageId ?? `msg-${Date.now().toString(36)}`;
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      const events = [
        `event: message_start\ndata: ${JSON.stringify({
          type: "message_start",
          message: {
            id: messageId,
            type: "message",
            role: "assistant",
            content: [],
            model,
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 },
          },
        })}\n\n`,
        `event: content_block_start\ndata: ${JSON.stringify({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        })}\n\n`,
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text },
        })}\n\n`,
        `event: content_block_stop\ndata: ${JSON.stringify({
          type: "content_block_stop",
          index: 0,
        })}\n\n`,
        `event: message_stop\ndata: ${JSON.stringify({
          type: "message_stop",
        })}\n\n`,
      ];
      for (const ev of events) controller.enqueue(enc.encode(ev));
      controller.close();
    },
  });
}
