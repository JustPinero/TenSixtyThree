/**
 * Phase 63.4 — 8 route segments had no loading.tsx / error.tsx, so they
 * showed a blank frame while data loaded and Next's unthemed default
 * error page on a throw. app/team and app/boards are DB-backed and the
 * most likely to throw. There was also no not-found.tsx and no
 * global-error.tsx, so a bad slug or a root-layout throw escaped the
 * theme entirely.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, statSync } from "fs";
import path from "path";

const APP = path.resolve(__dirname, "../app");

/** Route segments: directories that render a page. */
function routeSegments(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (
      entry.startsWith(".") ||
      entry === "components" ||
      entry === "api" ||
      entry === "generated"
    ) {
      continue;
    }
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(path.join(full, "page.tsx"))) acc.push(full);
    routeSegments(full, acc);
  }
  return acc;
}

const SEGMENTS = routeSegments(APP);

describe("route boundaries", () => {
  it("finds the app's route segments", () => {
    expect(SEGMENTS.length).toBeGreaterThan(10);
  });

  for (const seg of SEGMENTS) {
    const rel = path.relative(path.dirname(APP), seg);
    it(`${rel} has a loading state`, () => {
      expect(
        existsSync(path.join(seg, "loading.tsx")),
        `${rel} shows a blank frame while loading`,
      ).toBe(true);
    });
    it(`${rel} has an error boundary`, () => {
      expect(
        existsSync(path.join(seg, "error.tsx")),
        `${rel} falls through to Next's unthemed error page`,
      ).toBe(true);
    });
  }

  it("has a themed not-found page", () => {
    expect(existsSync(path.join(APP, "not-found.tsx"))).toBe(true);
  });

  it("has a global-error boundary for root-layout throws", () => {
    expect(existsSync(path.join(APP, "global-error.tsx"))).toBe(true);
  });
});
