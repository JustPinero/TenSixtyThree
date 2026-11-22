/**
 * Phase 69.1 — the loop branches on stop_reason and reports WHY it
 * stopped early (iteration cap vs timeout vs abort vs max_tokens vs
 * refusal), so the user is told the truth.
 */
import { describe, it, expect } from "vitest";
import {
  ToolRegistry,
  runToolUseLoop,
  type AnthropicCaller,
  type AnthropicMessageResponse,
  type ToolContext,
} from "@/lib/overseer-tools";

function ctx(): ToolContext {
  return { prisma: {} as ToolContext["prisma"] };
}

function response(
  stop_reason: string,
  content: AnthropicMessageResponse["content"],
): AnthropicMessageResponse {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    content,
    model: "claude-test",
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function sequence(responses: AnthropicMessageResponse[]): AnthropicCaller {
  let i = 0;
  return async () => {
    if (i >= responses.length) throw new Error("exhausted");
    return responses[i++];
  };
}

const base = (
  caller: AnthropicCaller,
  extra: Partial<Parameters<typeof runToolUseLoop>[0]> = {},
) =>
  runToolUseLoop({
    caller,
    model: "claude-test",
    systemPrompt: "sys",
    messages: [{ role: "user", content: "hi" }],
    registry: new ToolRegistry(),
    ctx: ctx(),
    ...extra,
  });

describe("stop_reason matrix", () => {
  it("end_turn → final text, not truncated", async () => {
    const res = await base(
      sequence([response("end_turn", [{ type: "text", text: "done" }])]),
    );
    expect(res).toMatchObject({ finalText: "done", truncated: false });
    expect(res.truncatedReason).toBeUndefined();
  });

  it("max_tokens → keeps the partial text and says the reply was cut off", async () => {
    const res = await base(
      sequence([response("max_tokens", [{ type: "text", text: "partial" }])]),
    );
    expect(res).toMatchObject({
      finalText: "partial",
      truncated: true,
      truncatedReason: "max_tokens",
    });
  });

  it("refusal → reported as a refusal, not an empty success", async () => {
    const res = await base(sequence([response("refusal", [])]));
    expect(res).toMatchObject({ truncated: true, truncatedReason: "refusal" });
  });

  it("pause_turn → the loop continues the same turn instead of ending it", async () => {
    const caller = sequence([
      response("pause_turn", [{ type: "text", text: "working… " }]),
      response("end_turn", [{ type: "text", text: "finished" }]),
    ]);
    const res = await base(caller);
    // Both halves of the paused turn reach the user: the loop called again.
    expect(res).toMatchObject({ truncated: false, finalText: "working… finished" });
  });

  it("iteration cap → truncatedReason iterations", async () => {
    const reg = new ToolRegistry();
    reg.register({
      name: "noop",
      description: "d",
      inputSchema: { type: "object", properties: {} },
      handler: async () => ({ ok: true }),
    });
    const tool = response("tool_use", [
      { type: "tool_use", id: "t", name: "noop", input: {} },
    ]);
    const res = await base(sequence([tool, tool]), {
      registry: reg,
      maxIterations: 2,
    });
    expect(res).toMatchObject({
      truncated: true,
      truncatedReason: "iterations",
    });
  });

  it("an abort for the server timeout is reported as a timeout; any other abort as aborted", async () => {
    const timeout = new AbortController();
    timeout.abort("timeout");
    expect(
      await base(sequence([response("end_turn", [])]), {
        signal: timeout.signal,
      }),
    ).toMatchObject({ truncated: true, truncatedReason: "timeout" });
    const client = new AbortController();
    client.abort();
    expect(
      await base(sequence([response("end_turn", [])]), {
        signal: client.signal,
      }),
    ).toMatchObject({ truncated: true, truncatedReason: "aborted" });
  });
});
