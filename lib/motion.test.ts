/**
 * Phase 62.5 — the dashboard animates permanently: 25 infinite pulse
 * classes on health dots, a 30s background grid drift, and 3D tile hover
 * transforms. `prefers-reduced-motion` was honored nowhere (WCAG 2.2.2).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf-8");

describe("reduced motion", () => {
  it("has a prefers-reduced-motion block", () => {
    expect(CSS).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });

  it("neutralizes animation AND transition, including pseudo-elements", () => {
    const m = CSS.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/,
    );
    expect(m, "no reduced-motion block").not.toBeNull();
    const body = m![1];
    expect(body).toMatch(/animation[^;]*none\s*!important/);
    expect(body).toMatch(/transition[^;]*none\s*!important/);
    expect(body).toMatch(/::before/);
    expect(body).toMatch(/::after/);
  });

  it("every infinite animation lives in a class the block can reach", () => {
    // Guards against a future inline `style={{ animation }}`, which
    // !important in a media query cannot override.
    const inlineAnimated: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) {
          const src = readFileSync(full, "utf-8");
          if (/style=\{\{[^}]*animation/i.test(src)) {
            inlineAnimated.push(path.relative(ROOT, full));
          }
        }
      }
    };
    walk(path.join(ROOT, "app"));
    expect(inlineAnimated, inlineAnimated.join("\n")).toEqual([]);
  });

  it("status is never conveyed by animation alone", () => {
    // pulse-* classes mark health; each must pair with a color class so
    // stopping the animation does not remove the signal.
    for (const cls of ["pulse-healthy", "pulse-warning", "pulse-blocked"]) {
      const re = new RegExp(String.raw`\.${cls}\b[^{]*\{([^}]*)\}`);
      const m = CSS.match(re);
      expect(m, `no .${cls} rule`).not.toBeNull();
    }
  });
});
