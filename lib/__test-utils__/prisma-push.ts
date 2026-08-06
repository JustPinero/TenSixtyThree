import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { dbNameForFileUrl, TEST_PG_BASE } from "./pg-file-url-compat";

const CASCADE_ROOT = path.resolve(__dirname, "..", "..");
const PSQL_ADMIN = `${TEST_PG_BASE}/postgres`;

/**
 * Push the Prisma schema to a test database. Cross-platform: passes
 * DATABASE_URL via env option instead of an inline shell prefix (which
 * doesn't parse on Windows cmd).
 */
export function pushTestSchema(dbUrl: string, cwd: string = CASCADE_ROOT): void {
  // Phase 51.1 compat: legacy tests pass file: URLs. Translate to a per-file
  // Postgres database recreated from the schema-applied template (fast path);
  // fall back to a real `prisma db push` when the template is absent.
  if (dbUrl.startsWith("file:")) {
    const dbName = dbNameForFileUrl(dbUrl);
    const psql = (sql: string) =>
      execSync(`psql "${PSQL_ADMIN}" -v ON_ERROR_STOP=1 -c '${sql}'`, {
        stdio: "pipe",
        env: {
          ...process.env,
          PATH: `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}`,
        },
      });
    const locked = (sql: string) =>
      execSync(
        `psql "${PSQL_ADMIN}" -v ON_ERROR_STOP=1 -c 'SELECT pg_advisory_lock(1063)' -c '${sql}'`,
        {
          stdio: "pipe",
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}`,
          },
        }
      );
    locked(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    try {
      locked(`CREATE DATABASE "${dbName}" TEMPLATE "test_rig_template"`);
      return;
    } catch {
      locked(`CREATE DATABASE "${dbName}"`);
      dbUrl = `${TEST_PG_BASE}/${dbName}`;
    }
  }
  execSync("pnpm exec prisma db push", {
    cwd,
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
}

/**
 * Initialize a git repo with a baseline commit. Sets user.name and
 * user.email locally so `git commit` succeeds even when the host has
 * no global git identity (common on fresh Windows installs).
 */
export function gitInitWithAuthor(
  dir: string,
  initialContent?: { file: string; contents: string }
): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.name "Cascade Test"', { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@cascade.local"', {
    cwd: dir,
    stdio: "pipe",
  });
  if (initialContent) {
    const filePath = path.join(dir, initialContent.file);
    fs.writeFileSync(filePath, initialContent.contents);
  }
  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  execSync('git commit --allow-empty -m "init"', {
    cwd: dir,
    stdio: "pipe",
  });
}
