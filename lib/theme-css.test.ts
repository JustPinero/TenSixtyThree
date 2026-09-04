/**
 * Drift guard: every registry theme key must have a real CSS variable
 * block in app/globals.css, and each block must define the full token
 * set the component layer consumes. A registry entry without CSS would
 * silently render as the inherited dark palette.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { THEME_KEYS } from "./theme-registry";

const css = readFileSync(
  path.resolve(__dirname, "../app/globals.css"),
  "utf-8",
);

/** Every custom property the base/component CSS consumes. */
const REQUIRED_VARS = [
  "--bg-primary",
  "--bg-secondary",
  "--bg-panel",
  "--bg-panel-hover",
  "--bg-inset",
  "--border-dim",
  "--border-default",
  "--border-bright",
  "--cyan",
  "--cyan-dim",
  "--cyan-glow",
  "--amber",
  "--amber-glow",
  "--danger",
  "--danger-glow",
  "--info",
  "--accent",
  "--accent-glow",
  "--success",
  "--success-glow",
  "--text-primary",
  "--text-secondary",
  "--text-dim",
  "--scanline-opacity",
  "--noise-opacity",
  "--shadow-color",
  "--glass-bg",
  "--glass-border",
];

/** Extract the rule body for a selector that mentions [data-theme="key"]. */
function blockFor(key: string): string | null {
  // Match a selector list containing the attribute selector, then its body.
  const re = new RegExp(
    String.raw`[^{}]*\[data-theme="${key}"\][^{}]*\{([^}]*)\}`,
  );
  const match = css.match(re);
  return match ? match[1] : null;
}

describe("globals.css theme coverage", () => {
  for (const key of THEME_KEYS) {
    it(`defines a complete [data-theme="${key}"] block`, () => {
      const body = blockFor(key);
      expect(body, `no CSS block for theme "${key}"`).not.toBeNull();
      for (const cssVar of REQUIRED_VARS) {
        expect(body, `theme "${key}" is missing ${cssVar}`).toContain(
          `${cssVar}:`,
        );
      }
    });
  }

  it("keeps legacy dark/light alias selectors (pre-migration localStorage + SSR default)", () => {
    expect(blockFor("dark")).not.toBeNull();
    expect(blockFor("light")).not.toBeNull();
  });

  it("dark aliases cyberpunk and light aliases sunny (same block)", () => {
    expect(blockFor("dark")).toBe(blockFor("cyberpunk"));
    expect(blockFor("light")).toBe(blockFor("sunny"));
  });
});

describe("theme-aware talking pulse (53.2)", () => {
  it("delamain-talk keyframes glow with var(--cyan-glow), not hardcoded cyan", () => {
    const start = css.indexOf("@keyframes delamain-talk");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}\n}", start) + 3);
    expect(block).toContain("var(--cyan-glow)");
    expect(block).not.toContain("65, 166, 181");
  });

  it("overseer-chat has no hardcoded cyan talking shadow", () => {
    const chat = readFileSync(
      path.resolve(__dirname, "../app/components/overseer-chat.tsx"),
      "utf-8"
    );
    expect(chat).not.toContain("rgba(65,166,181");
  });
});
