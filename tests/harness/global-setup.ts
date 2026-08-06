/**
 * Phase 51.1 — Vitest globalSetup (Postgres edition).
 *
 * Creates a schema-applied TEMPLATE DATABASE once per test run; per-rig
 * databases are created via `CREATE DATABASE ... TEMPLATE ...` (Postgres's
 * native equivalent of the old copy-the-SQLite-file trick — fast and
 * worker-safe because template reads take no exclusive locks as long as
 * nothing holds a connection to the template).
 *
 * Admin connection: TEST_PG_ADMIN_URL (defaults to the local dev container's
 * `postgres` maintenance DB). All rig DBs are named test_rig_* so setup can
 * sweep leftovers from crashed runs before workers spawn.
 */
import { execSync } from "child_process";
import path from "path";
import { Client } from "pg";

const CASCADE_ROOT = path.resolve(__dirname, "..", "..");

export const TEST_PG_BASE =
  process.env.TEST_PG_BASE_URL ||
  "postgresql://tensixtythree:tensixtythree@localhost:51063";
const ADMIN_URL = `${TEST_PG_BASE}/postgres`;
export const TEMPLATE_DB = "test_rig_template";

export async function setup() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    // Sweep rig DBs leaked by crashed prior runs (globalSetup runs before
    // any worker, so nothing can be mid-use). [41.1-residual] preserved.
    const leftovers = await admin.query(
      `SELECT datname FROM pg_database WHERE datname LIKE 'test_rig_%'`
    );
    for (const row of leftovers.rows) {
      await admin.query(`DROP DATABASE IF EXISTS "${row.datname}" WITH (FORCE)`);
    }
    await admin.query(`CREATE DATABASE "${TEMPLATE_DB}"`);
  } finally {
    await admin.end();
  }

  execSync("pnpm exec prisma db push", {
    cwd: CASCADE_ROOT,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: `${TEST_PG_BASE}/${TEMPLATE_DB}` },
  });
}

export async function teardown() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  try {
    const all = await admin.query(
      `SELECT datname FROM pg_database WHERE datname LIKE 'test_rig_%'`
    );
    for (const row of all.rows) {
      await admin.query(`DROP DATABASE IF EXISTS "${row.datname}" WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}
