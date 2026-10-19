/**
 * Model-ID hygiene.
 *
 * Four call sites hardcoded `claude-haiku-4-5-20251001`. The correct ID
 * carries no date suffix — Anthropic's IDs are complete as given, and a
 * dated variant is a guess that can stop resolving. They also bypassed
 * lib/model-config, so a retirement meant hunting four files.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import {
  CHAT_MODEL_OPTIONS,
  DEFAULT_CHAT_MODEL,
  UTILITY_MODEL,
} from "./model-config";

const ROOT = path.resolve(__dirname, "..");

function sources(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".") || e === "generated") {
      continue;
    }
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) acc.push(full);
  }
  return acc;
}

describe("model IDs", () => {
  it("exposes a named utility model for cheap background work", () => {
    expect(UTILITY_MODEL).toBeTruthy();
  });

  it("uses no date-suffixed model IDs anywhere in app or lib", () => {
    // usage-summary keeps the dated alias as a PRICING key so historical
    // usage rows written before the fix still price correctly. It is never
    // sent to the API.
    const pricingAlias = path.join(ROOT, "lib/observability/usage-summary.ts");
    const offenders: string[] = [];
    for (const f of sources(path.join(ROOT, "lib")).concat(
      sources(path.join(ROOT, "app")),
    )) {
      if (f === pricingAlias) continue;
      const src = readFileSync(f, "utf-8")
        // strip comments — the fix is documented in prose that names the old ID
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const m of src.matchAll(/claude-[a-z0-9-]*-\d{8}\b/g)) {
        offenders.push(`${path.relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      `model IDs are complete as published — drop the date suffix:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("routes background model choices through model-config, not literals", () => {
    const allowed = new Set([
      path.join(ROOT, "lib/model-config.ts"),
      path.join(ROOT, "lib/observability/usage-summary.ts"),
    ]);
    const offenders: string[] = [];
    for (const f of sources(path.join(ROOT, "lib")).concat(
      sources(path.join(ROOT, "app")),
    )) {
      if (allowed.has(f)) continue;
      const src = readFileSync(f, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const m of src.matchAll(/"claude-[a-z0-9-]+"/g)) {
        offenders.push(`${path.relative(ROOT, f)}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      `import UTILITY_MODEL / DEFAULT_CHAT_MODEL instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("offers the current generation and marks older tiers as previous", () => {
    const ids = CHAT_MODEL_OPTIONS.map((o) => o.id);
    expect(ids).toContain("claude-opus-5");
    expect(ids).toContain(DEFAULT_CHAT_MODEL);
    for (const o of CHAT_MODEL_OPTIONS) {
      const superseded = ["claude-sonnet-4-6", "claude-opus-4-8"];
      if (superseded.includes(o.id)) {
        expect(o.note.toLowerCase(), `${o.id} should be labelled`).toContain(
          "previous",
        );
      }
    }
  });
});
