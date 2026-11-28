/** Phase 58.4 — validate-env.sh can fail: hosted-required vars under RAILWAY_ENVIRONMENT. */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function run(env: Record<string, string>) {
  return spawnSync("bash", ["scripts/validate-env.sh"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      NODE_ENV: "test",
      ...env,
    },
    encoding: "utf8",
  });
}

describe("scripts/validate-env.sh", () => {
  it("exits 1 on Railway when a hosted-required var is missing", () => {
    const res = run({ RAILWAY_ENVIRONMENT: "production" });
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/Missing hosted-required env/);
  }, 60_000);

  // [1.0.D16] the runner service never reads the web app's auth/OAuth vars.
  it("on the runner service, checks only the runner's own vars", () => {
    const ok = run({
      RAILWAY_ENVIRONMENT: "production",
      RUNNER_MODE: "1",
      DATABASE_URL: "postgresql://x@127.0.0.1:1/x",
      ENCRYPTION_KEY: "k".repeat(44),
    });
    expect(ok.status).toBe(0);
    expect(ok.stderr + ok.stdout).not.toMatch(/BETTER_AUTH_SECRET|AUTH_REQUIRED/);
    const missing = run({ RAILWAY_ENVIRONMENT: "production", RUNNER_MODE: "1" });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/Missing runner-required env: DATABASE_URL, ENCRYPTION_KEY/);
  }, 60_000);

  it("stays a warning-only check locally (no RAILWAY_ENVIRONMENT)", () => {
    expect(run({}).status).toBe(0);
  }, 60_000);
});
