/**
 * Focus visibility guard (Phase 62.1).
 *
 * Measured on the live dashboard: 50 of 50 interactive elements had
 * outline:none with no replacement — the app was unusable by keyboard.
 * 19 of the 21 `focus:outline-none` substituted only a 1px border-color
 * change (itself 2.63:1 in some packs); the command palette and the
 * Overseer chat input had nothing at all.
 *
 * Rule: killing the native outline is allowed ONLY alongside a
 * `focus-visible:` replacement on the same element.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) acc.push(full);
  }
  return acc;
}

/**
 * className values (template or plain string) that contain
 * focus:outline-none, paired with whether they also ring on focus-visible.
 */
function outlineKillers(): { file: string; snippet: string }[] {
  const bad: { file: string; snippet: string }[] = [];
  for (const file of tsxFiles(path.join(ROOT, "app"))) {
    const src = readFileSync(file, "utf-8");
    const rel = path.relative(ROOT, file);
    for (const m of src.matchAll(/className=\{?[`"]([\s\S]*?)[`"]\}?/g)) {
      const cls = m[1];
      if (!cls.includes("focus:outline-none")) continue;
      if (/focus-visible:(outline|ring)/.test(cls) || cls.includes("focus-ring")) {
        continue;
      }
      bad.push({ file: rel, snippet: cls.replace(/\s+/g, " ").trim().slice(0, 90) });
    }
  }
  return bad;
}

describe("keyboard focus", () => {
  it("never removes the focus outline without a focus-visible replacement", () => {
    const bad = outlineKillers();
    const report = bad.map((b) => `  ${b.file}\n    ${b.snippet}`).join("\n");
    expect(
      bad.length,
      `focus:outline-none with no visible replacement (keyboard users see nothing):\n${report}`,
    ).toBe(0);
  });

  it("defines a reusable .focus-ring utility in globals.css", () => {
    const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf-8");
    expect(css).toMatch(/\.focus-ring\b/);
    expect(css).toMatch(/:focus-visible/);
  });
});
