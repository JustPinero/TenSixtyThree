/**
 * Phase 47.1 — configurable AI service + chat model.
 * Resolution order: DB override (CascadeConfig) → env → default.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  DEFAULT_CHAT_MODEL,
  CHAT_MODEL_OPTIONS,
  resolveChatModel,
  resolveAiService,
} from "./model-config";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  delete process.env.CASCADE_CHAT_MODEL;
  delete process.env.CASCADE_AI_SERVICE;
});

describe("model config", () => {
  it("defaults to claude-sonnet-5 on the claude service", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    expect(DEFAULT_CHAT_MODEL).toBe("claude-sonnet-5");
    expect(await resolveChatModel(rig.prisma)).toBe("claude-sonnet-5");
    expect(await resolveAiService(rig.prisma)).toBe("claude");
  });

  it("env var overrides the default", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    process.env.CASCADE_CHAT_MODEL = "claude-opus-4-8";
    expect(await resolveChatModel(rig.prisma)).toBe("claude-opus-4-8");
  });

  it("DB override (CascadeConfig.chatModel) beats env", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    process.env.CASCADE_CHAT_MODEL = "claude-opus-4-8";
    await rig.prisma.cascadeConfig.upsert({
      where: { id: 1 },
      update: { chatModel: "claude-sonnet-4-6" },
      create: { id: 1, chatModel: "claude-sonnet-4-6" },
    });
    expect(await resolveChatModel(rig.prisma)).toBe("claude-sonnet-4-6");
  });

  it("rejects unknown models from the DB (falls back to env/default)", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await rig.prisma.cascadeConfig.upsert({
      where: { id: 1 },
      update: { chatModel: "gpt-9000" },
      create: { id: 1, chatModel: "gpt-9000" },
    });
    expect(await resolveChatModel(rig.prisma)).toBe(DEFAULT_CHAT_MODEL);
  });

  it("exposes the selectable model options including the default", () => {
    expect(CHAT_MODEL_OPTIONS.map((o) => o.id)).toContain("claude-sonnet-5");
    expect(CHAT_MODEL_OPTIONS.map((o) => o.id)).toContain("claude-opus-4-8");
  });
});
