/**
 * Phase 59.3 — destructive-migration guard.
 *
 * Hosted Postgres holds real rows, and `prisma migrate deploy` applies a
 * migration without asking. A statement that can lose data must be a
 * deliberate choice: the migration file has to carry an
 * `-- allow-destructive` marker (ideally with the reason) or CI fails.
 *
 * Flagged: DROP TABLE / COLUMN / SCHEMA / TYPE / VIEW, column type changes
 * (a cast can truncate or fail), TRUNCATE, DELETE FROM.
 * Not flagged: DROP INDEX / CONSTRAINT / DEFAULT / NOT NULL — they change
 * no stored values and are routine in generated migrations.
 */

export const ALLOW_MARKER = /^\s*--\s*allow-destructive\b/im;

const DESTRUCTIVE: RegExp[] = [
  /^DROP\s+(TABLE|SCHEMA|TYPE|VIEW|MATERIALIZED\s+VIEW)\b/i,
  /^ALTER\s+TABLE\b[\s\S]*\bDROP\s+COLUMN\b/i,
  /^ALTER\s+TABLE\b[\s\S]*\bALTER\s+COLUMN\b[\s\S]*\b(SET\s+DATA\s+)?TYPE\b/i,
  /^TRUNCATE\b/i,
  /^DELETE\s+FROM\b/i,
];

/** Split SQL into statements, dropping `--` comment lines. */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Every statement in `sql` that can destroy stored data. */
export function findDestructiveStatements(sql: string): string[] {
  return statements(sql).filter((stmt) =>
    DESTRUCTIVE.some((re) => re.test(stmt)),
  );
}

export interface MigrationCheck {
  ok: boolean;
  offenders: string[];
}

/** A migration passes if it is non-destructive or explicitly marked. */
export function checkMigration(sql: string): MigrationCheck {
  const offenders = findDestructiveStatements(sql);
  return { ok: offenders.length === 0 || ALLOW_MARKER.test(sql), offenders };
}
