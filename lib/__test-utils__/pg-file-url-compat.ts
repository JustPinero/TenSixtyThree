/**
 * Phase 51.1 — SQLite→Postgres COMPAT LAYER for the ~48 legacy test files that
 * hand-construct `new PrismaBetterSqlite3({ url: "file:/...x.db" })` and call
 * `pushTestSchema("file:...")`.
 *
 * Rather than rewriting every file in the migration slice, vitest aliases
 * `@prisma/adapter-better-sqlite3` to this module. The exported class keeps
 * the old name/shape but returns a PrismaPg adapter pointed at a per-file
 * Postgres database, derived DETERMINISTICALLY from the old file path — so the
 * adapter constructor and pushTestSchema (which performs the create) agree on
 * the database name without coordination.
 *
 * DB names use the `test_rig_` prefix so globalSetup's crashed-run sweep and
 * teardown cover them too. The `fs.unlinkSync(TEST_DB_PATH)` cleanup calls in
 * legacy files no-op harmlessly (the .db files simply never exist).
 *
 * This is transitional: new tests should use tests/harness/dispatch-rig.ts.
 * Migrating legacy files off the shim is tracked in phase-51 follow-ups.
 */
import { createHash } from "crypto";
import { PrismaPg } from "@prisma/adapter-pg";

export const TEST_PG_BASE =
  process.env.TEST_PG_BASE_URL ||
  "postgresql://tensixtythree:tensixtythree@localhost:51063";

/** file:/path/to/foo.db → test_rig_c_<hash12> (stable within+across runs). */
export function dbNameForFileUrl(fileUrl: string): string {
  const p = fileUrl.replace(/^file:/, "");
  const hash = createHash("sha256").update(p).digest("hex").slice(0, 12);
  return `test_rig_c_${hash}`;
}

export function pgUrlForFileUrl(fileUrl: string): string {
  return `${TEST_PG_BASE}/${dbNameForFileUrl(fileUrl)}`;
}

/** Drop-in replacement for the old adapter class (aliased in vitest.config). */
export class PrismaBetterSqlite3 extends PrismaPg {
  constructor(opts: { url: string }) {
    super({ connectionString: pgUrlForFileUrl(opts.url) });
  }
}
