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

  it("stays a warning-only check locally (no RAILWAY_ENVIRONMENT)", () => {
    expect(run({}).status).toBe(0);
  }, 60_000);
});
