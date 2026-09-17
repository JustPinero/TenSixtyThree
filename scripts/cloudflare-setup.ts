#!/usr/bin/env tsx
/**
 * Idempotent Cloudflare bring-up for tensixtythree.com (handoff 2026-09-16,
 * "CLOUDFLARE MOVE"). Safe to re-run; it only creates/updates, never deletes.
 *
 *   CLOUDFLARE_API_TOKEN=$(op read "op://Cascade/TenSixtyThree Cloudflare token/credential") \
 *     pnpm exec tsx scripts/cloudflare-setup.ts [--dry-run] [--skip-worker]
 *
 * Token scopes: Account·Workers Scripts·Edit; Zone·Zone·Edit; Zone·DNS·Edit;
 * Zone·Zone Settings·Edit; Zone·SSL and Certificates·Edit; Zone·Workers
 * Routes·Edit — zone resources "all zones in account".
 *
 * Steps: zone (create if missing → print nameservers for GoDaddy) → DNS
 * records → SSL Full + Always-Use-HTTPS → upload Worker → routes.
 */
import {
  type ExistingDnsRecord,
  WORKER_NAME,
  WORKER_ROUTES,
  ZONE_NAME,
  desiredRecords,
  planRecordChanges,
  recordKey,
  transpileWorker,
} from "@/infra/cloudflare/setup";

const API = "https://api.cloudflare.com/client/v4";
const ACCOUNT_ID = "4ffe1d5336c8789075f1df3b03d98022"; // Justin's personal CF account
const COMPATIBILITY_DATE = "2026-09-01";

const dryRun = process.argv.includes("--dry-run");
const skipWorker = process.argv.includes("--skip-worker");

interface CfEnvelope<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

interface Zone {
  id: string;
  name: string;
  status: string;
  name_servers?: string[];
}
interface WorkerRoute {
  id: string;
  pattern: string;
  script?: string;
}

function token(): string {
  const value = process.env.CLOUDFLARE_API_TOKEN;
  if (!value) {
    console.error(
      "CLOUDFLARE_API_TOKEN is unset. Mint it in the Cloudflare dashboard (My Profile → API Tokens → Create Custom Token) with the scopes in this file's header, save to 1Password (Cascade vault → \"TenSixtyThree Cloudflare token\", field `credential`), then re-run.",
    );
    process.exit(2);
  }
  return value;
}

async function cf<T>(
  method: string,
  route: string,
  body?: BodyInit,
  contentType: string | null = "application/json",
): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${token()}` };
  if (contentType) headers["content-type"] = contentType;
  const res = await fetch(`${API}${route}`, { method, headers, body });
  const json = (await res.json()) as CfEnvelope<T>;
  if (!res.ok || !json.success) {
    const detail = json.errors?.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`${method} ${route} → HTTP ${res.status} ${detail ?? ""}`);
  }
  return json.result;
}

function log(step: string, message: string): void {
  console.log(`[cloudflare-setup] ${step}: ${message}`);
}

async function ensureZone(): Promise<Zone> {
  const found = await cf<Zone[]>("GET", `/zones?name=${ZONE_NAME}&account.id=${ACCOUNT_ID}`);
  if (found.length > 0) {
    log("zone", `exists (${found[0].id}, status=${found[0].status})`);
    return found[0];
  }
  if (dryRun) {
    log("zone", "would create (dry-run)");
    return { id: "dry-run", name: ZONE_NAME, status: "pending" };
  }
  const zone = await cf<Zone>(
    "POST",
    "/zones",
    JSON.stringify({ name: ZONE_NAME, account: { id: ACCOUNT_ID }, type: "full" }),
  );
  log("zone", `created ${zone.id} (status=${zone.status})`);
  return zone;
}

async function ensureRecords(zoneId: string): Promise<void> {
  const existing =
    zoneId === "dry-run"
      ? []
      : await cf<ExistingDnsRecord[]>("GET", `/zones/${zoneId}/dns_records?per_page=200`);
  const plan = planRecordChanges(existing, desiredRecords());
  log(
    "dns",
    `create=${plan.create.length} update=${plan.update.length} unchanged=${plan.unchanged.length} (untouched foreign=${existing.length - plan.unchanged.length - plan.update.length})`,
  );
  for (const record of plan.create) {
    log("dns", `+ ${recordKey(record)} → ${record.content}${record.proxied ? " (proxied)" : ""}`);
    if (!dryRun) await cf("POST", `/zones/${zoneId}/dns_records`, JSON.stringify(record));
  }
  for (const { id, record } of plan.update) {
    log("dns", `~ ${recordKey(record)} → ${record.content}${record.proxied ? " (proxied)" : ""}`);
    if (!dryRun) await cf("PATCH", `/zones/${zoneId}/dns_records/${id}`, JSON.stringify(record));
  }
}

async function ensureSettings(zoneId: string): Promise<void> {
  const settings: [string, string][] = [
    ["ssl", "full"],
    ["always_use_https", "on"],
  ];
  for (const [key, value] of settings) {
    log("settings", `${key}=${value}`);
    if (!dryRun && zoneId !== "dry-run") {
      await cf("PATCH", `/zones/${zoneId}/settings/${key}`, JSON.stringify({ value }));
    }
  }
}

async function ensureWorker(zoneId: string): Promise<void> {
  const js = transpileWorker();
  log("worker", `${WORKER_NAME}: ${js.length} bytes of ES module`);
  if (dryRun || zoneId === "dry-run") return;

  const form = new FormData();
  form.set(
    "metadata",
    new Blob(
      [JSON.stringify({ main_module: "worker.js", compatibility_date: COMPATIBILITY_DATE })],
      { type: "application/json" },
    ),
  );
  form.set("worker.js", new Blob([js], { type: "application/javascript+module" }), "worker.js");
  await cf("PUT", `/accounts/${ACCOUNT_ID}/workers/scripts/${WORKER_NAME}`, form, null);
  log("worker", "uploaded");

  const routes = await cf<WorkerRoute[]>("GET", `/zones/${zoneId}/workers/routes`);
  for (const pattern of WORKER_ROUTES) {
    const current = routes.find((r) => r.pattern === pattern);
    if (current?.script === WORKER_NAME) {
      log("routes", `= ${pattern}`);
    } else if (current) {
      await cf("PUT", `/zones/${zoneId}/workers/routes/${current.id}`, JSON.stringify({ pattern, script: WORKER_NAME }));
      log("routes", `~ ${pattern} → ${WORKER_NAME}`);
    } else {
      await cf("POST", `/zones/${zoneId}/workers/routes`, JSON.stringify({ pattern, script: WORKER_NAME }));
      log("routes", `+ ${pattern} → ${WORKER_NAME}`);
    }
  }
}

(async () => {
  token();
  const zone = await ensureZone();
  await ensureRecords(zone.id);
  await ensureSettings(zone.id);
  if (skipWorker) log("worker", "skipped (--skip-worker)");
  else await ensureWorker(zone.id);

  console.log("");
  if (zone.status !== "active") {
    console.log(
      `NEXT (Justin, GoDaddy): Domains → ${ZONE_NAME} → Nameservers → Custom →\n  ${(zone.name_servers ?? ["<see Cloudflare dashboard>"]).join("\n  ")}\nZone goes "active" once Cloudflare sees the delegation (minutes to hours).`,
    );
  }
  console.log(
    `THEN: railway variables set BETTER_AUTH_URL=https://www.${ZONE_NAME} --service tensixtythree-app && railway up --service tensixtythree-app --ci\n` +
      `VERIFY: curl -sI https://www.${ZONE_NAME}/signin (200) · https://${ZONE_NAME}/ (301 → www) · demo mint · Overseer SSE.\n` +
      `OAUTH: add https://www.${ZONE_NAME}/api/auth/callback/{github,google} to both OAuth apps.`,
  );
})().catch((error: unknown) => {
  console.error(`[cloudflare-setup] FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
