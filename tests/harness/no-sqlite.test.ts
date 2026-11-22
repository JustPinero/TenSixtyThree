/**
 * Phase 60.1 [1.0.D1] — every DB test runs on the Postgres rig. The
 * SQLite adapter, its compat alias and the per-file push helpers are gone
 * and must stay gone.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (["node_modules", ".next", "generated", ".git"].includes(n)) return [];
    const full = path.join(dir, n);
    if (statSync(full).isDirectory()) return testFiles(full);
    return /\.test\.tsx?$/.test(n) ? [full] : [];
  });
}

describe("no SQLite left in the test suite", () => {
  it("no test imports the better-sqlite3 adapter or the retired helpers", () => {
    const offenders = ["lib", "app", "tests", "scripts"]
      .flatMap((d) => testFiles(path.join(ROOT, d)))
      .filter((f) => !f.endsWith("no-sqlite.test.ts"))
      .filter((f) =>
        /adapter-better-sqlite3|__test-utils__\/(prisma-push|pg-file-url-compat)/.test(
          readFileSync(f, "utf8"),
        ),
      )
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("the vitest alias and the compat shim are gone", () => {
    expect(readFileSync(path.join(ROOT, "vitest.config.ts"), "utf8")).not.toContain(
      "adapter-better-sqlite3",
    );
    expect(existsSync(path.join(ROOT, "lib/__test-utils__/pg-file-url-compat.ts"))).toBe(false);
  });
});
