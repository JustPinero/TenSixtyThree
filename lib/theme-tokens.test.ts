/**
 * Bridge guard (Phase 61.1).
 *
 * Tailwind 4 emits a color utility ONLY if the color exists in the
 * `@theme` layer. A class like `text-space-400` whose token is missing
 * from the bridge produces NO CSS at all — the element silently renders
 * at the inherited body color. That shipped: `text-text-dim` (52 uses),
 * `text-space-400` (45), `text-space-300`, `text-emerald` were absent
 * from the built bundle while looking perfectly correct in the source.
 *
 * This test fails on any theme-namespace color class whose token the
 * bridge does not define.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf-8");

/** Color names the bridge declares, i.e. `--color-<name>: ...`. */
function bridgeColors(): Set<string> {
  const names = new Set<string>();
  for (const block of CSS.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)) {
    for (const decl of block[1].matchAll(/--color-([a-z0-9-]+)\s*:/g)) {
      names.add(decl[1]);
    }
  }
  return names;
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) {
      continue;
    }
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Utilities whose final segment is a COLOR. */
const COLOR_UTILITIES =
  "text|bg|border|ring|outline|fill|stroke|from|via|to|divide|caret|accent|decoration|placeholder|shadow";

/** Semantic color names owned by the theme layer (bare, no numeric shade). */
const SEMANTIC = new Set([
  "cyan",
  "cyan-dim",
  "amber",
  "danger",
  "info",
  "accent",
  "success",
  "muted",
  "emerald",
]);

/** Is this color name part of OUR theme namespace (vs a Tailwind built-in)? */
function isThemeNamespace(color: string): boolean {
  if (/^space-\d+$/.test(color)) return true;
  if (/^text-(dim|bright|secondary|muted)$/.test(color)) return true;
  return SEMANTIC.has(color);
}

interface Usage {
  color: string;
  file: string;
  cls: string;
}

function themeColorUsages(): Usage[] {
  const re = new RegExp(
    String.raw`(?:^|[\s"'\`{(\[])((?:[a-z-]+:)*)(?:${COLOR_UTILITIES})-([a-z][a-z0-9-]*)`,
    "g",
  );
  const out: Usage[] = [];
  for (const file of sourceFiles(path.join(ROOT, "app")).concat(
    sourceFiles(path.join(ROOT, "lib")),
  )) {
    const src = readFileSync(file, "utf-8");
    for (const m of src.matchAll(re)) {
      const color = m[2];
      if (!isThemeNamespace(color)) continue;
      out.push({
        color,
        file: path.relative(ROOT, file),
        cls: m[0].trim(),
      });
    }
  }
  return out;
}

describe("Tailwind theme bridge", () => {
  const declared = bridgeColors();
  const usages = themeColorUsages();

  it("finds theme-namespace color classes to check (guard is wired up)", () => {
    expect(usages.length).toBeGreaterThan(50);
  });

  it("declares every theme color the app actually uses", () => {
    const missing = new Map<string, Usage[]>();
    for (const u of usages) {
      if (!declared.has(u.color)) {
        const list = missing.get(u.color) ?? [];
        list.push(u);
        missing.set(u.color, list);
      }
    }
    const report = [...missing.entries()]
      .map(([color, list]) => {
        const files = [...new Set(list.map((l) => l.file))].slice(0, 4);
        return `  --color-${color} is NOT in @theme (${list.length} uses, e.g. ${files.join(", ")})`;
      })
      .join("\n");
    expect(
      missing.size,
      `These color classes emit NO CSS — the elements render at the inherited color:\n${report}`,
    ).toBe(0);
  });

  it("maps every bridge color to a defined custom property", () => {
    const unresolved: string[] = [];
    for (const block of CSS.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)) {
      for (const decl of block[1].matchAll(
        /--color-([a-z0-9-]+)\s*:\s*var\(([^)]+)\)/g,
      )) {
        const target = decl[2].trim();
        // The root block must define it (":root, [data-theme=..." block).
        if (!new RegExp(String.raw`${target}\s*:`).test(CSS)) {
          unresolved.push(`--color-${decl[1]} -> ${target} (undefined)`);
        }
      }
    }
    expect(unresolved, unresolved.join("\n")).toEqual([]);
  });
});
