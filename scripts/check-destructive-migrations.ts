/**
 * Phase 59.3 — fail when any migration can destroy data without an
 * explicit `-- allow-destructive` marker. Scans every
 * prisma/migrations/<name>/migration.sql (no git history needed, so it
 * works in a shallow CI checkout): an old destructive migration only
 * passes because it carries its marker.
 *
 *   pnpm db:check-migrations
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { checkMigration } from "../lib/migration-guard";

const dir = path.resolve(__dirname, "..", "prisma", "migrations");
let failed = 0;
let scanned = 0;

for (const entry of readdirSync(dir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(dir, entry.name, "migration.sql");
  if (!existsSync(file)) continue;
  scanned++;
  const res = checkMigration(readFileSync(file, "utf8"));
  if (!res.ok) {
    failed++;
    console.error(
      `✗ ${entry.name}: destructive statements without "-- allow-destructive":`,
    );
    for (const stmt of res.offenders)
      console.error(`    ${stmt.slice(0, 160)}`);
  }
}

if (failed > 0) {
  console.error(
    `\n${failed} migration(s) can lose data. If that is intended, add a line\n` +
      `"-- allow-destructive: <why>" to the migration and back up hosted first.`,
  );
  process.exit(1);
}
console.log(
  `Migration guard: ${scanned} migration(s), none destructive without a marker.`,
);
