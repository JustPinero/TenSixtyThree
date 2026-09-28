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
    /*
     * [1.0.D1] — every statement below must run in ONE psql session.
     * pg_advisory_lock is session-scoped: it is released the moment psql
     * exits, so issuing DROP and CREATE as two processes left the pair
     * unserialized. Parallel files then raced on
     * `CREATE DATABASE ... TEMPLATE test_rig_template`, which errors
     * while any other session is connected to the template. The catch
     * fell back to a full `prisma db push` (seconds each), and enough of
     * those at once blew the 30s beforeAll timeout — the suite's only
     * source of non-determinism.
     */
    const lockedSession = (...statements: string[]) =>
      execSync(
        [
          `psql "${PSQL_ADMIN}" -v ON_ERROR_STOP=1`,
          `-c 'SELECT pg_advisory_lock(1063)'`,
          ...statements.map((sql) => `-c '${sql}'`),
        ].join(" "),
        {
          stdio: "pipe",
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/libpq/bin:${process.env.PATH ?? ""}`,
          },
        }
      );

    try {
      lockedSession(
        `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`,
        `CREATE DATABASE "${dbName}" TEMPLATE "test_rig_template"`
      );
      return;
    } catch (err) {
      /*
       * The bare `catch {}` this replaces swallowed the reason entirely,
       * so a template clone that started failing under load looked
       * identical to "template absent" — and the only visible symptom
       * was a 30s hook timeout somewhere else. The fallback runs a full
       * `prisma db push` (seconds), so silently taking it at scale is
       * exactly what makes the suite non-deterministic. Say so.
       */
      const reason = err instanceof Error ? err.message : String(err);
      const stderr =
        typeof err === "object" && err !== null && "stderr" in err
          ? String((err as { stderr?: unknown }).stderr ?? "")
          : "";
      console.error(
        `[prisma-push] template clone FAILED for ${dbName}; falling back to a full db push. ` +
          `This path is slow and is the usual cause of hook timeouts. ` +
          `reason: ${reason.split("\n")[0]} ${stderr.split("\n").slice(0, 2).join(" ")}`.trim()
      );
      lockedSession(
        `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`,
        `CREATE DATABASE "${dbName}"`
      );
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
