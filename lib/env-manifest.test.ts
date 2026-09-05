/**
 * Phase 51.4 — env manifest + hosted validation.
 * AC1 from requests/phase-51-hosted/51.4-railway-deploy.md.
 */
import { describe, it, expect } from "vitest";
import { ENV_MANIFEST, validateHostedEnv } from "./env-manifest";

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

  it("covers every env var the app reads (inventory 2026-08-06, +54.1)", () => {
    // From: grep -rhoE 'process\.env\.[A-Z_0-9]+' app lib scripts
    const inventory = [
      "ANTHROPIC_API_KEY",
      "ADMIN_EMAILS",
      "ENCRYPTION_KEY",
      "RESEND_API_KEY",
      "EMAIL_FROM",
      "VERCEL_TOKEN",
      "DATABASE_URL",
      "RAILWAY_TOKEN",
      "PROJECTS_DIR",
      "CASCADE_MAX_CONCURRENT_SUBAGENTS",
      "KILROY_BRAIN_PATH",
      "CASCADE_CHAT_MODEL",
      "AUTH_REQUIRED",
      "CASCADE_PLUGIN_JSON_PATH",
      "CASCADE_CLAUDE_CONFIG_PATH",
      "CASCADE_AI_SERVICE",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_CLIENT_ID",
      "CASCADE_WEBHOOK_SPOOL",
      "CASCADE_WEBHOOK_SECRET_PATH",
      "CASCADE_PORT",
      "BETTER_AUTH_URL",
      "BETTER_AUTH_SECRET",
    ];
    const declared = new Set(ENV_MANIFEST.map((s) => s.name));
    for (const name of inventory) {
      expect(declared, `manifest is missing ${name}`).toContain(name);
    }
  });

  it("every manifest entry has a non-empty description", () => {
    for (const spec of ENV_MANIFEST) {
      expect(spec.description.trim().length, spec.name).toBeGreaterThan(0);
    }
  });
});
