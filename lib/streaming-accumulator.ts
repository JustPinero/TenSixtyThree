/**
 * Phase 25.2 — pure SSE event applier for the Anthropic Messages
 * streaming API.
 *
 * Apply events one at a time; at message_stop, `assemble()` returns
 * the same shape a buffered response would have. Decoupled from
 * fetch/transport so tests feed fixture event sequences directly.
 *
 * Reference: references/anthropic-streaming-tool-use.md.
 */
import type {
  AnthropicMessageResponse,
  ContentBlock,
} from "@/lib/overseer-tools";

export interface MessageStartEvent {
  type: "message_start";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    content: ContentBlock[];
    model: string;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: AnthropicMessageResponse["usage"];
  };
}

export interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block:
    | { type: "text"; text: string }
    | {
        type: "tool_use";
        id: string;
        name: string;
        input: Record<string, unknown>;
      }
    | { type: "thinking"; thinking: string }
    | { type: "redacted_thinking"; data: string };
}

export interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta:
    | { type: "text_delta"; text: string }
    | { type: "input_json_delta"; partial_json: string }
    | { type: "thinking_delta"; thinking: string }
    | { type: "signature_delta"; signature: string }
    | { type: "citations_delta"; citation: unknown };
}

export interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface MessageDeltaEvent {
  type: "message_delta";
  delta: { stop_reason: string | null; stop_sequence?: string | null };
  usage?: Partial<AnthropicMessageResponse["usage"]>;
}

export interface MessageStopEvent {
  type: "message_stop";
}

/** Phase 69.1 — the API reports mid-stream failures as an `error` event. */
export interface StreamErrorEvent {
  type: "error";
  error: { type: string; message: string };
}

export type StreamEvent =
  | StreamErrorEvent
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent;

interface AccumulatedTextBlock {
  type: "text";
  text: string;
}

interface AccumulatedToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Buffered partial_json — parsed on content_block_stop. */
  _partialJson: string;
}

interface AccumulatedThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

interface AccumulatedRedactedThinkingBlock {
  type: "redacted_thinking";
  data: string;
}

type AccumulatedBlock =
  | AccumulatedTextBlock
  | AccumulatedToolUseBlock
  | AccumulatedThinkingBlock
  | AccumulatedRedactedThinkingBlock;

export interface StreamAccumulatorState {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  blocks: Map<number, AccumulatedBlock>;
  stopReason: string | null;
  stopSequence: string | null;
  usage: AnthropicMessageResponse["usage"];
  /** 69.1 — block indices that received content_block_stop. */
  closed: Set<number>;
  /** 69.1 — message_stop arrived. */
  stopped: boolean;
}

export function createStreamAccumulator(): StreamAccumulatorState {
  return {
    id: "",
    type: "message",
    role: "assistant",
    model: "",
    blocks: new Map(),
    stopReason: null,
    stopSequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    closed: new Set(),
    stopped: false,
  };
}

export function applyStreamEvent(
  state: StreamAccumulatorState,
  event: StreamEvent
): void {
  switch (event.type) {
    case "error": {
      // 69.1 — overloaded/api errors mid-stream: never assemble a reply.
      throw new Error(
        `[stream-accumulator] API error mid-stream: ${event.error?.type ?? "error"}: ${
          event.error?.message ?? "unknown"
        }`,
      );
    }
    case "message_start": {
      state.id = event.message.id;
      state.model = event.message.model;
      state.usage = { ...state.usage, ...event.message.usage };
      break;
    }
    case "content_block_start": {
      const cb = event.content_block;
      if (cb.type === "text") {
        state.blocks.set(event.index, { type: "text", text: cb.text });
      } else if (cb.type === "tool_use") {
        state.blocks.set(event.index, {
          type: "tool_use",
          id: cb.id,
          name: cb.name,
          input: { ...cb.input },
          _partialJson: "",
        });
      } else if (cb.type === "thinking") {
        state.blocks.set(event.index, {
          type: "thinking",
          thinking: cb.thinking,
          signature: "",
        });
      } else if (cb.type === "redacted_thinking") {
        state.blocks.set(event.index, { type: "redacted_thinking", data: cb.data });
      }
      break;
    }
    case "content_block_delta": {
      const block = state.blocks.get(event.index);
      if (!block) return;
      if (event.delta.type === "text_delta" && block.type === "text") {
        block.text += event.delta.text;
      } else if (
        event.delta.type === "input_json_delta" &&
        block.type === "tool_use"
      ) {
        block._partialJson += event.delta.partial_json;
      } else if (
        event.delta.type === "thinking_delta" &&
        block.type === "thinking"
      ) {
        block.thinking += event.delta.thinking;
      } else if (
        event.delta.type === "signature_delta" &&
        block.type === "thinking"
      ) {
        block.signature = event.delta.signature;
      }
      // citations_delta is captured at higher level by route handlers
      // (Phase 25.3); accumulator currently no-ops it.
      break;
    }
    case "content_block_stop": {
      state.closed.add(event.index);
      const block = state.blocks.get(event.index);
      if (block?.type === "tool_use" && block._partialJson.length > 0) {
        try {
          block.input = JSON.parse(block._partialJson) as Record<string, unknown>;
        } catch (err) {
          throw new Error(
            `[stream-accumulator] tool_use input_json_delta did not parse at content_block_stop (index ${event.index}): ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
      break;
    }
    case "message_delta": {
      if (event.delta.stop_reason !== undefined) {
        state.stopReason = event.delta.stop_reason;
      }
      if (event.delta.stop_sequence !== undefined) {
        state.stopSequence = event.delta.stop_sequence ?? null;
      }
      if (event.usage) {
        state.usage = { ...state.usage, ...event.usage };
      }
      break;
    }
    case "message_stop":
      state.stopped = true;
      break;
  }
}

/**
 * Build the assembled response. Drops the internal `_partialJson`
 * scratch field from tool_use blocks.
 */
export function assembleResponse(
  state: StreamAccumulatorState
): AnthropicMessageResponse {
  // 69.1 — a cut-off stream is an error, not a shorter reply.
  if (!state.stopped) {
    throw new Error("[stream-accumulator] stream ended without message_stop (incomplete response)");
  }
  const indices = Array.from(state.blocks.keys()).sort((a, b) => a - b);
  for (const i of indices) {
    const b = state.blocks.get(i)!;
    if (b.type === "tool_use" && !state.closed.has(i)) {
      throw new Error(
        `[stream-accumulator] tool_use "${b.name}" input never closed (index ${i}); refusing to execute it`,
      );
    }
  }
  const content: ContentBlock[] = indices.map((i) => {
    const b = state.blocks.get(i)!;
    if (b.type === "redacted_thinking") {
      return { type: "redacted_thinking", data: b.data };
    }
    if (b.type === "tool_use") {
      return {
        type: "tool_use",
        id: b.id,
        name: b.name,
        input: b.input,
      };
    }
    if (b.type === "thinking") {
      return {
        type: "thinking",
        thinking: b.thinking,
        signature: b.signature,
      };
    }
    return { type: "text", text: b.text };
  });
  return {
    id: state.id,
    type: "message",
    role: "assistant",
    content,
    model: state.model,
    stop_reason: state.stopReason,
    stop_sequence: state.stopSequence,
    usage: state.usage,
  };
}
