/**
 * Phase 63.1 — the field recipe was duplicated VERBATIM in 13 files and
 * the section heading in 17 places. That duplication is the reason the
 * focus and contrast defects survived: each fix needed 19 edits, so it
 * was never made. This caps the worst offenders.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

function sources(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) acc.push(full);
  }
  return acc;
}

function countAcrossApp(needle: string): number {
  let n = 0;
  for (const f of sources(path.join(ROOT, "app"))) {
    n += readFileSync(f, "utf-8").split(needle).length - 1;
  }
  return n;
}

describe("UI duplication", () => {
  it("the field recipe lives in one place (.input), not in every file", () => {
    const recipe = "bg-space-900 border border-space-600 text-text-bright";
    expect(
      countAcrossApp(recipe),
      "use the .input component class plus sizing utilities",
    ).toBe(0);
  });

  it("the .input class is defined in globals.css", () => {
    const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf-8");
    expect(css).toMatch(/^\.input\s*\{/m);
    expect(css).toMatch(/\.input::placeholder/);
    expect(css).toMatch(/\.input:focus-visible/);
  });

  it("no theme-bypassing default-palette colors on interactive surfaces", () => {
    // bg-white knobs were invisible on light packs; text-red-400 never
    // changed with the theme.
    const offenders: string[] = [];
    for (const f of sources(path.join(ROOT, "app"))) {
      const src = readFileSync(f, "utf-8");
      for (const m of src.matchAll(/\b(bg-white|text-red-400|text-red-500)\b/g)) {
        offenders.push(`${path.relative(ROOT, f)}: ${m[1]}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
