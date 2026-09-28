/**
 * Phase 63.6 — globals.css themed only input[type=text], textarea and
 * select. The app also ships password, email, date and range inputs, so
 * the SIGN-IN email and password fields rendered flat and unthemed next
 * to every other field in the product.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf-8");

/** input types actually used in the app. */
function usedInputTypes(): Set<string> {
  const types = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) {
        for (const m of readFileSync(full, "utf-8").matchAll(
          /type=["']([a-z]+)["']/g,
        )) {
          types.add(m[1]);
        }
      }
    }
  };
  walk(path.join(ROOT, "app"));
  return types;
}

describe("input theming", () => {
  it("does not enumerate a single input type", () => {
    // The type-list approach is what silently excluded password/email.
    expect(CSS).not.toMatch(/input\[type="text"\],\s*textarea,\s*select\s*\{/);
  });

  it("themes text-like inputs by exclusion, not by enumeration", () => {
    expect(CSS).toMatch(/input:not\(/);
  });

  it("covers every text-like input type the app uses", () => {
    const used = usedInputTypes();
    const excluded = new Set<string>();
    for (const m of CSS.matchAll(/input:not\(\[type="([a-z]+)"\]\)/g)) {
      excluded.add(m[1]);
    }
    const textLike = [...used].filter(
      (t) => !["checkbox", "radio", "submit", "button", "file", "range", "hidden"].includes(t),
    );
    for (const t of textLike) {
      expect(
        excluded.has(t),
        `input[type=${t}] is excluded from theming but is a text-like field`,
      ).toBe(false);
    }
  });

  it("still excludes controls that must not get an inset field look", () => {
    for (const t of ["checkbox", "radio", "submit", "range"]) {
      expect(CSS, `${t} should stay excluded`).toContain(`:not([type="${t}"])`);
    }
  });
});
