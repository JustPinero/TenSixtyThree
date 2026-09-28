/**
 * Phase 57.2 — CI was red on every push to main for two months and
 * nobody noticed, because:
 *   1. `pnpm/action-setup` was given `version: 10` while package.json
 *      also declares packageManager; the action refuses both and exits.
 *   2. The test job piped vitest through `tee` and took its exit code
 *      from `grep "Tests.*passed"`, which matches "Tests 2 failed |
 *      1690 passed" — so the job could not fail even when run.
 *   3. The test jobs had no Postgres service, and e2e still pointed at a
 *      retired SQLite file.
 *
 * These assertions are cheap and would have caught all four.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const CI_RAW = readFileSync(
  path.join(ROOT, ".github/workflows/ci.yml"),
  "utf-8",
);
/**
 * Comments explain these very defects, so asserting against the raw file
 * matches the prose rather than the config. Strip comment lines first.
 */
const CI = CI_RAW.split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");
const VALIDATE = readFileSync(
  path.join(ROOT, "scripts/validate.sh"),
  "utf-8",
);
const PKG = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf-8"),
) as { packageManager?: string };

describe("CI workflow", () => {
  it("does not pin a pnpm version alongside packageManager", () => {
    expect(PKG.packageManager, "packageManager is the source of truth").toMatch(
      /^pnpm@/,
    );
    // Precisely: an action-setup step with its own `with: version:` block.
    // (`node-version:` on the setup-node step is unrelated.)
    expect(
      CI,
      "pnpm/action-setup refuses to run when given both",
    ).not.toMatch(/pnpm\/action-setup[^\n]*\n\s*with:\s*\n\s*version:/);
  });

  it("runs the test suite in a way that can actually fail", () => {
    expect(CI).toMatch(/run:\s*pnpm test\b/);
    expect(
      CI,
      "an exit code taken from grep masks test failures",
    ).not.toMatch(/grep -q "Tests/);
  });

  it("provides Postgres to every job that runs the suite", () => {
    // The rig builds template databases; without a service they all error.
    const jobs = CI.split(/\n  (?=[a-z0-9-]+:\n)/);
    for (const job of jobs) {
      if (!/run:\s*(pnpm test|pnpm exec playwright test)/.test(job)) continue;
      expect(job, `a job runs tests without a postgres service:\n${job.slice(0, 200)}`)
        .toMatch(/image:\s*postgres:16/);
    }
  });

  it("never points a job at the retired SQLite database", () => {
    expect(CI).not.toMatch(/file:\.\//);
  });

  it("the playwright web server does not hardcode a SQLite URL either", () => {
    // The first fix missed this: playwright.config.ts set the dev
    // server's DATABASE_URL to file:./test-e2e.db, so the e2e job booted
    // the app against a retired engine and every request hit
    // ECONNREFUSED through the pg adapter.
    const pw = readFileSync(path.join(ROOT, "playwright.config.ts"), "utf-8");
    expect(pw).not.toMatch(/DATABASE_URL:\s*"file:/);
    expect(pw).toMatch(/process\.env\.DATABASE_URL/);
  });

  it("covers every gate validate.sh runs", () => {
    const gates: [string, RegExp][] = [
      ["lint", /pnpm lint/],
      ["typecheck", /tsc --noEmit/],
      ["prisma generate", /prisma generate/],
      ["tests", /pnpm test/],
      ["build", /pnpm build/],
    ];
    for (const [name, re] of gates) {
      expect(VALIDATE, `validate.sh lost the ${name} gate`).toMatch(re);
      expect(CI, `CI is missing the ${name} gate`).toMatch(re);
    }
  });
});
