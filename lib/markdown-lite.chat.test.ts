/** Phase 69.2 — the markdown the Overseer actually writes. */
import { describe, it, expect } from "vitest";
import { parseMarkdownLite } from "./markdown-lite";

describe("markdown-lite for chat replies", () => {
  it("fenced code blocks are kept verbatim (no inline parsing inside)", () => {
    const blocks = parseMarkdownLite(
      "Run:\n\n```bash\npnpm test **not bold**\n  indented\n```\n\nDone.",
    );
    expect(blocks).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "Run:" }] },
      {
        type: "codeblock",
        lang: "bash",
        value: "pnpm test **not bold**\n  indented",
      },
      { type: "paragraph", children: [{ type: "text", value: "Done." }] },
    ]);
  });

  it("an unclosed fence still shows its content", () => {
    expect(parseMarkdownLite("```\nhalf")).toEqual([
      { type: "codeblock", lang: "", value: "half" },
    ]);
  });

  it("safe links become links; javascript: and data: stay text", () => {
    const [p] = parseMarkdownLite(
      "See [docs](https://example.com/x), [page](/settings) and [bad](javascript:alert(1)).",
    );
    expect(p).toMatchObject({ type: "paragraph" });
    const children = p.type === "paragraph" ? p.children : [];
    expect(children).toContainEqual({
      type: "link",
      value: "docs",
      href: "https://example.com/x",
    });
    expect(children).toContainEqual({
      type: "link",
      value: "page",
      href: "/settings",
    });
    expect(
      children.some(
        (c) => c.type === "link" && c.href.startsWith("javascript"),
      ),
    ).toBe(false);
  });

  it("[L-42] citations link to the lesson page", () => {
    const [p] = parseMarkdownLite("Pin Node [L-42].");
    expect(p.type === "paragraph" && p.children).toContainEqual({
      type: "link",
      value: "[L-42]",
      href: "/knowledge/lesson/42",
    });
  });

  it("with breaks, single newlines inside a paragraph are kept", () => {
    expect(parseMarkdownLite("one\ntwo", { breaks: true })).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "one" },
          { type: "break" },
          { type: "text", value: "two" },
        ],
      },
    ]);
    expect(parseMarkdownLite("one\ntwo")).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "one two" }] },
    ]);
  });
});
