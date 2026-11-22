/**
 * Phase 68.5 — one name. User-visible components never hardcode the old
 * product name ("Cascade"), the original persona ("Delamain"), the
 * retired database ("SQLite"), or the operator's own project names in
 * examples. The assistant's name comes from the persona
 * (app/components/use-persona.ts / lib/theme-registry.ts).
 *
 * Comments are stripped first; lowercase identifiers (localStorage keys
 * like "cascade-overseer", routes like "/delamain") are not user-visible
 * copy and are not matched (the patterns are case-sensitive words).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const APP = path.resolve(__dirname, "..", "app");
const FORBIDDEN = /\bDelamain\b|\bCascade\b|\bSQLite\b|\bratracer\b|\bpointpartner\b|\bmedipal\b|\bsitelift\b/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "generated" ? [] : tsxFiles(full);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [full] : [];
  });
}

function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // JSX comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1"); // line comments (not URLs)
}

describe("brand strings in user-visible components (68.5)", () => {
  it("no hardcoded Delamain / Cascade / SQLite / operator project names", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(APP)) {
      stripComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          if (FORBIDDEN.test(line)) {
            offenders.push(`${path.relative(APP, file)}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
