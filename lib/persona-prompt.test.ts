import { describe, it, expect } from "vitest";
import { buildPersonaBlock } from "./persona-prompt";

describe("buildPersonaBlock", () => {
  it("returns empty string when there is nothing to say", () => {
    expect(buildPersonaBlock({})).toBe("");
    expect(buildPersonaBlock({ name: "", personality: "" })).toBe("");
    expect(buildPersonaBlock({ name: "   ", personality: "\n\t" })).toBe("");
    expect(buildPersonaBlock({ name: undefined, personality: null })).toBe("");
  });

  it("treats non-string inputs as absent", () => {
    expect(buildPersonaBlock({ name: 42, personality: { evil: true } })).toBe(
      "",
    );
    expect(buildPersonaBlock({ name: ["Console"] })).toBe("");
  });

  it("name only names the assistant", () => {
    const block = buildPersonaBlock({ name: "Console" });
    expect(block).toContain("Console");
    expect(block).not.toContain("undefined");
    expect(block).not.toContain("null");
  });

  it("personality only shapes conduct", () => {
    const block = buildPersonaBlock({ personality: "Terse sysop." });
    expect(block).toContain("Terse sysop.");
  });

  it("both fields appear together", () => {
    const block = buildPersonaBlock({
      name: "Curator",
      personality: "Measured and scholarly.",
    });
    expect(block).toContain("Curator");
    expect(block).toContain("Measured and scholarly.");
  });

  it("caps name at 60 chars and personality at 500", () => {
    const block = buildPersonaBlock({
      name: "N".repeat(200),
      personality: "P".repeat(2000),
    });
    expect(block).not.toContain("N".repeat(61));
    expect(block).toContain("N".repeat(60));
    expect(block).not.toContain("P".repeat(501));
    expect(block).toContain("P".repeat(500));
  });

  it("strips control characters", () => {
    const block = buildPersonaBlock({
      name: "Con\x00sole\x07",
      personality: "Terse\x1b[31m sysop",
    });
    expect(block).toContain("Console");
    expect(block).not.toContain("\x00");
    expect(block).not.toContain("\x07");
    expect(block).not.toContain("\x1b");
  });

  it("nonempty output starts with a paragraph-break Persona header (safe append)", () => {
    const block = buildPersonaBlock({ name: "Sage" });
    expect(block.startsWith("\n\n# Persona")).toBe(true);
  });
});
