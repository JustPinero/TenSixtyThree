/** Phase 76 — the demo assistant answers the question that was asked. */
import { describe, it, expect } from "vitest";
import {
  demoOverseerReply,
  demoProjectReply,
  DEMO_REPLIES,
  DEMO_BRIEFING,
} from "./demo-overseer";

describe("demoOverseerReply", () => {
  it.each([
    ["What needs my attention today?", "attention", /Beacon Mobile/],
    ["Which projects are blocked, and why?", "attention", /blocked/i],
    ["How is Meridian doing?", "meridian", /Meridian Web/],
    ["status of the atlas api", "atlas", /Atlas API/],
    ["what's wrong with beacon", "beacon", /credentials/i],
    ["Plan this week's work across my projects", "plan", /Monday|this week/i],
    ["Run a full audit on all projects and tell me what needs attention", "audit", /grade/i],
    ["can you open a pull request for me", "runs", /pull request/i],
    ["what is this?", "about", /TenSixtyThree/],
  ])("%s → %s", (question, intent, pattern) => {
    const reply = demoOverseerReply(question);
    expect(reply).toBe(DEMO_REPLIES[intent as keyof typeof DEMO_REPLIES]);
    expect(reply).toMatch(pattern);
  });

  it("anything else gets a default that lists what to ask", () => {
    const reply = demoOverseerReply("tell me a joke about kubernetes");
    expect(reply).toBe(DEMO_REPLIES.fallback);
    expect(reply).toMatch(/Meridian/);
    expect(reply).toMatch(/scripted/i);
  });

  it("an audit question isn't swallowed by the word 'attention'", () => {
    expect(demoOverseerReply("audit everything and tell me what needs attention")).toBe(
      DEMO_REPLIES.audit,
    );
  });

  it("no reply splits bold across lines (raw ** showed in the chat)", () => {
    for (const text of [...Object.values(DEMO_REPLIES), DEMO_BRIEFING]) {
      for (const line of text.split("\n")) {
        expect((line.match(/\*\*/g) ?? []).length % 2, line).toBe(0);
      }
    }
  });
});

describe("demoProjectReply", () => {
  it("answers about the project whose page the visitor is on", () => {
    expect(demoProjectReply("Atlas API", "what's next?")).toMatch(/Atlas API/);
    expect(demoProjectReply("Beacon Mobile", "why blocked")).toMatch(/credentials/i);
  });

  it("an unknown project name still gets a sensible scripted answer", () => {
    expect(demoProjectReply("Something Else", "hi")).toMatch(/Something Else/);
  });
});
