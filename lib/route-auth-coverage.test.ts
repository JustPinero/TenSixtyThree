/**
 * Phase 64.1 — every API handler passes the access boundary.
 *
 * Walks app/api/**\/route.ts. Each exported HTTP handler must call one of
 * the lib/access.ts helpers (or activeOrgContext, which wraps a session
 * check + membership) before anything else of substance — or the file
 * must be listed in PUBLIC_ROUTES. A new route that forgets the check
 * fails here, not in production.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_ROUTES } from "./access";

const ROOT = path.resolve(__dirname, "..");
const API = path.join(ROOT, "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const GUARD =
  /\b(requireUser|requireSignedIn|requireAdmin|requireNonDemo|requireLocalMode|activeOrgContext)\s*\(/;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

/** Source of each exported handler, up to the next top-level export. */
export function handlerBodies(src: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const starts: { name: string; index: number }[] = [];
  const re =
    /^export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1], index: m.index });
  const anyTopLevel = /^(?:export\s|async\s+function|function\s|const\s)/gm;
  for (const s of starts) {
    anyTopLevel.lastIndex = s.index + 1;
    let end = src.length;
    let n: RegExpExecArray | null;
    while ((n = anyTopLevel.exec(src))) {
      if (n.index > s.index) {
        end = n.index;
        break;
      }
    }
    bodies.set(s.name, src.slice(s.index, end));
  }
  return bodies;
}

const files = routeFiles(API).map((f) => path.relative(ROOT, f));

describe("route auth coverage", () => {
  it("finds the API routes", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("PUBLIC_ROUTES only names files that exist", () => {
    for (const p of PUBLIC_ROUTES) expect(files).toContain(p);
  });

  for (const rel of files) {
    if (PUBLIC_ROUTES.includes(rel)) continue;
    it(`${rel} — every handler is guarded`, () => {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      // Guards must be the real ones, not a local look-alike.
      expect(
        /^(?:async\s+)?function\s+(requireUser|requireSignedIn|requireAdmin|requireNonDemo|requireLocalMode)\b/m.test(src),
        `${rel}: defines a local function shadowing a lib/access guard`,
      ).toBe(false);
      expect(
        /from\s+["']@\/lib\/(access|org-context)["']/.test(src),
        `${rel}: must import its guard from @/lib/access or @/lib/org-context`,
      ).toBe(true);
      const bodies = handlerBodies(src);
      const unguarded = [...bodies.entries()]
        .filter(([, body]) => !GUARD.test(body))
        .map(([name]) => name);
      expect(unguarded, `${rel}: unguarded ${unguarded.join(", ")}`).toEqual(
        [],
      );
      expect(bodies.size).toBeGreaterThan(0);
      for (const m of METHODS) {
        if (new RegExp(`^export .*\\b${m}\\b`, "m").test(src)) {
          expect(bodies.has(m), `${rel}: ${m} export not parsed`).toBe(true);
        }
      }
    });
  }
});
