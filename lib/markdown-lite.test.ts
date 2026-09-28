/**
 * Phase 63.3 — the morning briefing, the most prominent panel on the
 * landing screen, rendered its markdown source literally: visitors saw
 * "## Good morning" and "**Quick stats:**" as text (confirmed live).
 *
 * This is a deliberately tiny parser covering only what the briefing
 * generator emits. It produces an AST, never HTML, so nothing is ever
 * injected into the DOM as markup.
 */
import { describe, expect, it } from "vitest";
import { parseMarkdownLite } from "./markdown-lite";

describe("parseMarkdownLite", () => {
  it("parses ATX headings and strips the marker", () => {
    expect(parseMarkdownLite("## Good morning")).toEqual([
      { type: "heading", level: 2, children: [{ type: "text", value: "Good morning" }] },
    ]);
  });

  it("supports h3 as well as h2", () => {
    const [b] = parseMarkdownLite("### Details");
    expect(b).toMatchObject({ type: "heading", level: 3 });
  });

  it("parses **bold** runs inside a paragraph", () => {
    expect(parseMarkdownLite("**Quick stats:** 3 projects active.")).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "strong", value: "Quick stats:" },
          { type: "text", value: " 3 projects active." },
        ],
      },
    ]);
  });

  it("parses `code` spans", () => {
    const [b] = parseMarkdownLite("run `pnpm test` now");
    expect(b.type).toBe("paragraph");
    expect((b as { children: unknown[] }).children).toEqual([
      { type: "text", value: "run " },
      { type: "code", value: "pnpm test" },
      { type: "text", value: " now" },
    ]);
  });

  it("groups consecutive - items into one unordered list", () => {
    const blocks = parseMarkdownLite("- alpha\n- beta");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "list", ordered: false });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("groups consecutive 1. items into one ordered list", () => {
    const blocks = parseMarkdownLite("1. first\n2. second");
    expect(blocks[0]).toMatchObject({ type: "list", ordered: true });
  });

  it("keeps indented sub-items as list items (briefing nests findings)", () => {
    const blocks = parseMarkdownLite("- parent\n  - child");
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("splits paragraphs on blank lines", () => {
    const blocks = parseMarkdownLite("one\n\ntwo");
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.type === "paragraph")).toBe(true);
  });

  it("joins soft-wrapped lines into a single paragraph", () => {
    const blocks = parseMarkdownLite("one\ntwo");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", value: "one two" }],
    });
  });

  it("returns no blocks for empty or whitespace input", () => {
    expect(parseMarkdownLite("")).toEqual([]);
    expect(parseMarkdownLite("   \n\n  ")).toEqual([]);
  });

  it("leaves an unmatched ** as literal text (never throws)", () => {
    const [b] = parseMarkdownLite("5 ** 3 is not bold");
    expect(b.type).toBe("paragraph");
    expect(JSON.stringify(b)).toContain("5 ** 3 is not bold");
  });

  it("never emits raw markdown markers in text values", () => {
    const blocks = parseMarkdownLite(
      "## Good morning\n\n**Needs your attention:**\n- [NEEDS ATTENTION] drift\n\n1. Investigate",
    );
    const text = JSON.stringify(blocks);
    expect(text).not.toContain("##");
    expect(text).not.toContain("**");
    // Bracketed tags are content, not markup — they must survive.
    expect(text).toContain("[NEEDS ATTENTION]");
  });

  it("parses a realistic briefing without loss", () => {
    const src = [
      "## Good morning",
      "",
      "**Quick stats:** 3 projects active, 0 blocked.",
      "",
      "**Needs your attention:**",
      "- [NEEDS ATTENTION] Fleet reconciliation drift",
      "  - demo-atlas",
      "",
      "**Recommended priorities:**",
      "1. Investigate missing project paths",
      "2. Restart activity on TenSixtyThree",
    ].join("\n");
    const blocks = parseMarkdownLite(src);
    const kinds = blocks.map((b) => b.type);
    expect(kinds).toEqual([
      "heading",
      "paragraph",
      "paragraph",
      "list",
      "paragraph",
      "list",
    ]);
  });
});
