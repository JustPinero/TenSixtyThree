/**
 * Phase 48.1/48.2 — the three Project toggles become real.
 * autonomyMode maps to the Claude Code permission posture of the dispatched
 * session; agentTeamsEnabled gates team dispatch; prWorkflowEnabled injects
 * the PR instruction into the generated prompt.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  claudeInvocationFor,
  generatePrompt,
  dispatchTeam,
} from "./claude-dispatcher";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

describe("autonomyMode → permission posture", () => {
  it("full runs with permissions skipped (legacy behavior)", () => {
    expect(claudeInvocationFor("full")).toBe(
      "CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true claude",
    );
  });
  it("semi runs with acceptEdits permission mode", () => {
    expect(claudeInvocationFor("semi")).toBe(
      "claude --permission-mode acceptEdits",
    );
  });
  it("manual runs with default interactive permissions", () => {
    expect(claudeInvocationFor("manual")).toBe("claude");
  });
  it("unknown/missing modes fall back to full (backward compatible)", () => {
    expect(claudeInvocationFor(undefined)).toBe(
      "CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true claude",
    );
    expect(claudeInvocationFor("bogus")).toBe(
      "CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true claude",
    );
  });
});

describe("prWorkflowEnabled → prompt instruction", () => {
  it("injects the PR-workflow instruction when enabled", async () => {
    const withPr = await generatePrompt("/p/demo", "continue", undefined, {
      prWorkflowEnabled: true,
    });
    expect(withPr).toMatch(/pull request/i);
  });
  it("omits it when disabled", async () => {
    const without = await generatePrompt("/p/demo", "continue");
    expect(without).not.toMatch(/pull request/i);
  });
});

describe("agentTeamsEnabled gates team dispatch", () => {
  it("refuses when any target project has agent teams disabled", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await rig.prisma.project.create({
      data: {
        name: "no-teams",
        slug: "no-teams",
        path: "/p/no-teams",
        agentTeamsEnabled: false,
      },
    });
    const result = await dispatchTeam(rig.prisma, [
      { slug: "no-teams", prompt: "do work" },
    ] as never);
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/no-teams/);
    expect(String(result.error)).toMatch(/agent teams/i);
  });
});

describe("[36.A7] single dispatch readiness gate", () => {
  it("refuses to dispatch a project that is not dispatch-ready", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const project = await rig.prisma.project.create({
      data: { name: "ghost", slug: "ghost", path: "/p/ghost-does-not-exist" },
    });
    const { dispatchClaude } = await import("./claude-dispatcher");
    const result = await dispatchClaude(
      rig.prisma as never,
      { id: project.id, slug: project.slug, path: project.path },
      "do work",
      {}
    );
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/not dispatch-ready/i);
  });
});
