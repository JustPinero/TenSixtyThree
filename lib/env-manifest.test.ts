/**
 * Phase 51.4 — env manifest + hosted validation.
 * AC1 from requests/phase-51-hosted/51.4-railway-deploy.md.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ENV_MANIFEST, validateHostedEnv, validateRunnerEnv } from "./env-manifest";

/** Minimal complete hosted environment. */
function fullHostedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const spec of ENV_MANIFEST) {
    if (spec.scope === "hosted-required") env[spec.name] = "set";
  }
  env.AUTH_REQUIRED = "true";
  return env;
}

describe("AC1 — validateHostedEnv", () => {
  it("passes with every hosted-required var present", () => {
    const result = validateHostedEnv(fullHostedEnv());
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("reports each missing hosted-required var by name", () => {
    for (const spec of ENV_MANIFEST) {
      if (spec.scope !== "hosted-required") continue;
      const env = fullHostedEnv();
      delete env[spec.name];
      const result = validateHostedEnv(env);
      expect(result.ok).toBe(false);
      expect(result.missing).toContain(spec.name);
    }
  });

  it("treats empty string as missing", () => {
    const env = fullHostedEnv();
    env.DATABASE_URL = "";
    const result = validateHostedEnv(env);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("DATABASE_URL");
  });

  it("never requires local-only vars", () => {
    const result = validateHostedEnv(fullHostedEnv());
    const localOnly = ENV_MANIFEST.filter((s) => s.scope === "local-only").map(
      (s) => s.name,
    );
    expect(localOnly.length).toBeGreaterThan(0);
    for (const name of localOnly) {
      expect(result.missing).not.toContain(name);
    }
  });

  it("warns (does not fail) when AUTH_REQUIRED is not 'true'", () => {
    const env = fullHostedEnv();
    env.AUTH_REQUIRED = "false";
    const result = validateHostedEnv(env);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("AUTH_REQUIRED"))).toBe(true);
  });

  it("covers every env var the code reads (scanned, not hand-listed)", () => {
    const roots = ["app", "lib", "scripts", "middleware.ts", "instrumentation.ts"];
    const read = new Set<string>();
    const walk = (p: string) => {
      if (!fs.existsSync(p)) return;
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (/node_modules|generated/.test(p)) return;
        for (const e of fs.readdirSync(p)) walk(path.join(p, e));
      } else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) {
        for (const m of fs.readFileSync(p, "utf8").matchAll(/process\.env\.([A-Z_0-9]+)/g)) {
          read.add(m[1]);
        }
      }
    };
    for (const r of roots) walk(path.resolve(__dirname, "..", r));
    const declared = new Set(ENV_MANIFEST.map((s) => s.name));
    const undeclared = [...read].filter((n) => !declared.has(n)).sort();
    expect(undeclared).toEqual([]);
  });

  it("runner env: required vars are enforced (65.5)", () => {
    expect(validateRunnerEnv({}).ok).toBe(false);
    expect(validateRunnerEnv({}).missing).toEqual(
      expect.arrayContaining(["DATABASE_URL", "ENCRYPTION_KEY"]),
    );
    expect(
      validateRunnerEnv({ DATABASE_URL: "x", ENCRYPTION_KEY: "y" }).ok,
    ).toBe(true);
  });

  it("every manifest entry has a non-empty description", () => {
    for (const spec of ENV_MANIFEST) {
      expect(spec.description.trim().length, spec.name).toBeGreaterThan(0);
    }
  });
});
