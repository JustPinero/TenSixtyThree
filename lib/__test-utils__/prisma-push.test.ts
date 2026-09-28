/**
 * [1.0.D1] flakiness root cause (2026-09-28).
 *
 * `pushTestSchema` took pg_advisory_lock(1063) and then ran DROP and
 * CREATE in TWO separate psql processes. A session-level advisory lock
 * dies with its session, so the lock was released between them and the
 * pair was never actually serialized. Under parallel load several files
 * would call `CREATE DATABASE ... TEMPLATE test_rig_template` while
 * another still held a connection to the template; that errors, the
 * catch fell back to a full `prisma db push` (seconds), and enough of
 * those in parallel blew the 30s beforeAll timeout.
 *
 * Symptom on one unchanged commit: 0, 2, 9 and 9 failing files across
 * four full-suite runs, always alias-backed, always a hook timeout.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { dbNameForFileUrl, pgUrlForFileUrl, TEST_PG_BASE } from "./pg-file-url-compat";

const SRC = readFileSync(path.join(__dirname, "prisma-push.ts"), "utf-8");

describe("pushTestSchema locking", () => {
  it("holds the advisory lock across DROP and CREATE in one session", () => {
    // A single psql invocation carrying lock + drop + create.
    const combined = SRC.match(
      /pg_advisory_lock\(1063\)[\s\S]{0,400}?DROP DATABASE[\s\S]{0,400}?CREATE DATABASE/,
    );
    expect(
      combined,
      "DROP and CREATE must share one locked psql session, or the lock is released between them",
    ).not.toBeNull();
  });

  it("does not issue DROP and CREATE as separate locked() calls", () => {
    const separateCalls = SRC.match(/locked\(`?\s*(DROP|CREATE) DATABASE/g) ?? [];
    expect(
      separateCalls.length,
      `found ${separateCalls.length} separate locked() DDL calls; they must be one session`,
    ).toBeLessThanOrEqual(1);
  });
});

describe("db name derivation", () => {
  it("is deterministic for a given file url", () => {
    expect(dbNameForFileUrl("file:/tmp/a.db")).toBe(dbNameForFileUrl("file:/tmp/a.db"));
  });

  it("differs between file urls, so parallel files never share a database", () => {
    expect(dbNameForFileUrl("file:/tmp/a.db")).not.toBe(
      dbNameForFileUrl("file:/tmp/b.db"),
    );
  });

  it("keeps the test_rig_ prefix so the crashed-run sweep finds it", () => {
    expect(dbNameForFileUrl("file:/tmp/a.db")).toMatch(/^test_rig_/);
    expect(pgUrlForFileUrl("file:/tmp/a.db")).toBe(
      `${TEST_PG_BASE}/${dbNameForFileUrl("file:/tmp/a.db")}`,
    );
  });
});

describe("concurrent schema pushes (the actual failure mode)", () => {
  it("survives many simultaneous template clones", async () => {
    const { pushTestSchema } = await import("./prisma-push");
    const urls = Array.from({ length: 12 }, (_, i) => `file:/tmp/concurrency-probe-${i}.db`);
    const results = await Promise.allSettled(
      urls.map(
        (u) =>
          new Promise<void>((resolve, reject) => {
            try {
              pushTestSchema(u);
              resolve();
            } catch (e) {
              reject(e);
            }
          }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected");
    expect(
      failed.length,
      failed
        .map((f) => String((f as PromiseRejectedResult).reason).slice(0, 160))
        .join("\n"),
    ).toBe(0);
  }, 120_000);
});
