/**
 * Phase 63.2 — 89 sub-12px type declarations with no token: text-micro
 * x84, text-micro x3, plus a text-micro and a text-micro. Body-adjacent
 * copy at 8-10px is unreadable for many people and cannot be adjusted
 * without browser zoom.
 *
 * Floor: --text-micro (11px). Nothing smaller, and no ad-hoc pixel font
 * sizes, so the scale stays adjustable in one place.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf-8");

function sources(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) acc.push(full);
  }
  return acc;
}

describe("type scale", () => {
  it("defines --text-micro as the floor", () => {
    expect(CSS).toMatch(/--text-micro:\s*0?\.6875rem/);
  });

  it("has no arbitrary pixel font sizes in app/", () => {
    const hits: string[] = [];
    for (const f of sources(path.join(ROOT, "app"))) {
      for (const m of readFileSync(f, "utf-8").matchAll(/text-\[(\d+)px\]/g)) {
        hits.push(`${path.relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(
      hits,
      `use text-micro (11px) or a scale step:\n${hits.slice(0, 8).join("\n")}`,
    ).toEqual([]);
  });

  it("the floor is at least 11px (0.6875rem)", () => {
    const m = CSS.match(/--text-micro:\s*([\d.]+)rem/);
    expect(m).not.toBeNull();
    expect(parseFloat(m![1]) * 16).toBeGreaterThanOrEqual(11);
  });
});
