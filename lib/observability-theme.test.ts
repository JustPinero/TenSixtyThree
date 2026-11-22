/**
 * Phase 72 — the observability pages use the shared theme tokens and
 * primitives: fields use the `.input` recipe (not a hand-rolled one), and
 * none of the legacy aliases (space-300/400) or rounded corners that
 * the square theme packs render wrong.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(__dirname, "..", "app", "observability");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = path.join(dir, n);
    return statSync(full).isDirectory() ? files(full) : n.endsWith(".tsx") && !n.includes(".test.") ? [full] : [];
  });
}

describe("observability pages use theme tokens (72)", () => {
  it("no legacy color aliases (space-300/400) or rounded corners", () => {
    const offenders = files(DIR).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /\b(text|bg|border)-space-(300|400)\b|\brounded\b/.test(line))
        .map(({ line, i }) => `${path.relative(DIR, f)}:${i + 1}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("every input and select uses the shared .input recipe", () => {
    for (const f of files(DIR)) {
      const src = readFileSync(f, "utf8");
      const controls = src.match(/<(input|select)\b[\s\S]*?>/g) ?? [];
      for (const c of controls) {
        if (/type="hidden"/.test(c)) continue;
        expect(c, `${path.relative(DIR, f)}: ${c.slice(0, 80)}`).toMatch(/className="[^"]*\binput\b/);
      }
    }
  });
});
