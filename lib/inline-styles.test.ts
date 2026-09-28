/**
 * Inline-style allowlist (Phase 61.3).
 *
 * CLAUDE.md: "Tailwind for all styling — no inline styles". Inline style
 * also bypasses the [data-theme] layer entirely, which is how the sidebar
 * came to hardcode a dark gradient that made the navigation illegible in
 * the 8 light packs (active label measured 1.07:1 in `quiet`).
 *
 * Legitimate exceptions are values Tailwind cannot express: geometry
 * computed at runtime, and colors supplied by the theme registry. Those
 * are listed here; anything else fails.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

/** file -> why an inline style is unavoidable there. */
const ALLOWED: Record<string, string> = {
  "app/roadmap/page.tsx": "computed progress-bar width %",
  "app/components/project-tile.tsx": "computed progress-bar width %",
  "app/team/org-workspace.tsx": "computed progress-bar width %",
  "app/components/demo-tour.tsx":
    "spotlight rect + bubble position from getBoundingClientRect",
  "app/settings/page.tsx": "theme-pack preview swatch hex from THEME_PACKS",
  "app/global-error.tsx":
    "replaces the root layout on a layout-level throw: no ThemeProvider, " +
    "and globals.css may not have loaded, so Tailwind classes cannot be relied on",
};

/** Files exempt from the no-hex rule, for the reason given in ALLOWED. */
const HEX_EXEMPT = new Set(["app/settings/page.tsx", "app/global-error.tsx"]);

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

function filesWithInlineStyle(): string[] {
  return tsxFiles(path.join(ROOT, "app"))
    .filter((f) => /style=\{\{/.test(readFileSync(f, "utf-8")))
    .map((f) => path.relative(ROOT, f))
    .sort();
}

describe("inline styles", () => {
  it("only appear in files where Tailwind genuinely cannot express the value", () => {
    const unexpected = filesWithInlineStyle().filter((f) => !(f in ALLOWED));
    expect(
      unexpected,
      `inline style={{}} bypasses the [data-theme] layer; use theme utilities:\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });

  it("never hardcodes a hex color anywhere in app/ (themes must drive color)", () => {
    const offenders: string[] = [];
    for (const f of tsxFiles(path.join(ROOT, "app"))) {
      const rel = path.relative(ROOT, f);
      if (HEX_EXEMPT.has(rel)) continue;
      const src = readFileSync(f, "utf-8");
      for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
        offenders.push(`${rel}: ${m[0]}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the allowlist has no stale entries", () => {
    const actual = new Set(filesWithInlineStyle());
    const stale = Object.keys(ALLOWED).filter((f) => !actual.has(f));
    expect(stale, `remove from ALLOWED: ${stale.join(", ")}`).toEqual([]);
  });
});
