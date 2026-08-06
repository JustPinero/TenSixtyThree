/**
 * Phase 51.1b — one-shot data migration: legacy SQLite dev.db → Postgres.
 *
 * Reads every table from the old ./dev.db via the system sqlite3 CLI (no Prisma
 * — the generated client is Postgres-only now) and inserts via the Prisma
 * client into DATABASE_URL. Idempotent-ish: refuses to run if the target
 * already has Projects (pass --force to append anyway).
 *
 * Order respects FKs: Project → ActivityEvent/HumanTask/Dispatch/DispatchOutcome
 * → ChatSession → ChatMessage → the independents.
 *
 *   pnpm exec tsx scripts/migrate-dev-db.ts [--dry-run] [--force]
 */
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/db";

const DEV_DB = path.resolve(__dirname, "..", "dev.db");
const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

type Row = Record<string, unknown>;

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v as string | number);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Field-type map parsed straight from prisma/schema.prisma, so coercion is
 * driven by declared types (SQLite hands booleans back as 0/1 ints and
 * datetimes as strings/epochs).
 */
function parseSchemaTypes(): Record<string, Record<string, string>> {
  const schema = fs.readFileSync(
    path.resolve(__dirname, "..", "prisma", "schema.prisma"),
    "utf-8"
  );
  const models: Record<string, Record<string, string>> = {};
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(schema)) !== null) {
    const fields: Record<string, string> = {};
    for (const line of m[2].split("\n")) {
      const fm = line.trim().match(/^(\w+)\s+(\w+)(\?|\[\])?/);
      if (fm && !fm[1].startsWith("@@")) fields[fm[1]] = fm[2];
    }
    models[m[1]] = fields;
  }
  return models;
}

const SCHEMA_TYPES = parseSchemaTypes();

function coerceRow(table: string, r: Row): Row {
  const types = SCHEMA_TYPES[table] ?? {};
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) {
    const t = types[k];
    if (t === "Boolean") out[k] = v === null ? null : v === 1 || v === true;
    else if (t === "DateTime") out[k] = toDate(v);
    else out[k] = v;
  }
  return out;
}

async function main() {
  if (!fs.existsSync(DEV_DB)) {
    console.log(`No ${DEV_DB} — nothing to migrate.`);
    return;
  }
  // Read via the system sqlite3 CLI's JSON mode — no native Node bindings
  // (better-sqlite3 segfaults against this Node ABI, and the Prisma client
  // is Postgres-only now).
  const q = (sql: string): Row[] => {
    const out = execFileSync("sqlite3", ["-json", DEV_DB, sql], {
      encoding: "utf-8",
      maxBuffer: 256 * 1024 * 1024,
    }).trim();
    return out ? (JSON.parse(out) as Row[]) : [];
  };
  const tables = q(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'`,
  ).map((t) => String(t.name));
  console.log("source tables:", tables.join(", "));

  const existing = await prisma.project.count();
  if (existing > 0 && !FORCE) {
    throw new Error(
      `Target already has ${existing} projects — refusing without --force`,
    );
  }

  const read = (t: string): Row[] =>
    tables.includes(t) ? q(`SELECT * FROM "${t}"`) : [];

  // Ordered for FKs; every insert is schema-coerced generically.
  const ORDER: Array<[string, string]> = [
    ["Project", "project"],
    ["ActivityEvent", "activityEvent"],
    ["HumanTask", "humanTask"],
    ["Dispatch", "dispatch"],
    ["DispatchOutcome", "dispatchOutcome"],
    ["ChatSession", "chatSession"],
    ["ChatMessage", "chatMessage"],
    ["KnowledgeLesson", "knowledgeLesson"],
    ["Reminder", "reminder"],
    ["KickoffTemplate", "kickoffTemplate"],
    ["User", "user"],
    ["Team", "team"],
    ["Membership", "membership"],
    ["Invite", "invite"],
    ["AuditSnapshot", "auditSnapshot"],
    ["UpstreamFeature", "upstreamFeature"],
    ["ProjectFeatureUsage", "projectFeatureUsage"],
    ["FeatureProposal", "featureProposal"],
    ["AnthropicUsageEvent", "anthropicUsageEvent"],
    ["ToolCallEvent", "toolCallEvent"],
    ["CascadeConfig", "cascadeConfig"],
    ["Brain", "brain"],
  ];
  const client = prisma as unknown as Record<
    string,
    { create: (a: { data: never }) => Promise<unknown> }
  >;
  const plan = ORDER.map(([table, model]) => ({
    table,
    rows: read(table),
    insert: (r: Row) =>
      client[model].create({ data: coerceRow(table, r) as never }),
  }));

  for (const step of plan) {
    if (step.rows.length === 0) continue;
    console.log(
      `${DRY ? "[dry] " : ""}${step.table}: ${step.rows.length} rows`,
    );
    if (DRY) continue;
    let ok = 0;
    for (const row of step.rows) {
      try {
        await step.insert(row);
        ok++;
      } catch (e) {
        console.error(
          `  skip ${step.table} row:`,
          (e as Error).message.split("\n")[0],
        );
      }
    }
    console.log(`  inserted ${ok}/${step.rows.length}`);
  }
  console.log(DRY ? "dry run complete" : "migration complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
