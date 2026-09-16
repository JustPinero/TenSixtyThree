/**
 * Pure planning logic for the Cloudflare bring-up of tensixtythree.com.
 * The network side lives in scripts/cloudflare-setup.ts. Everything here is
 * deterministic and unit-tested (infra/cloudflare/setup.test.ts).
 *
 * Source of truth for the DNS-only records: the GoDaddy zone snapshot taken
 * 2026-09-16 before the nameserver move (local-only file
 * .claude/godaddy-zone-snapshot-2026-09-16.md).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const ZONE_NAME = "tensixtythree.com";
export const RAILWAY_APP_ORIGIN_HOST =
  "tensixtythree-app-production.up.railway.app";
export const WORKER_NAME = "tensixtythree-edge";
export const WORKER_ROUTES = [
  `${ZONE_NAME}/*`,
  `www.${ZONE_NAME}/*`,
] as const;

export interface DnsRecord {
  type: "CNAME" | "MX" | "TXT";
  name: string;
  content: string;
  proxied: boolean;
  /** 1 = "automatic" on Cloudflare. */
  ttl: number;
  priority?: number;
}

export interface ExistingDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
  priority?: number;
}

const RESEND_DKIM =
  "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDXMB39tGEWYtrFwVeW4v+fM/mjFLOKdvhLbEYV4zsixVTCeX9FJ/gdfqjLG8YW+2NR92jVCnSlOPq0OnGcIx0Vm16dqjJGraHbuXof1ghw/SfkCwGQd+urzl/lGOkxfFwxApH5q2J4L/gnd6B/BdCwGyp2lXAb/F2mMCLSyg0aTwIDAQAB";

export function desiredRecords(): DnsRecord[] {
  const auto = 1;
  return [
    // Proxied (orange) — Cloudflare terminates TLS; the Worker forwards.
    { type: "CNAME", name: ZONE_NAME, content: RAILWAY_APP_ORIGIN_HOST, proxied: true, ttl: auto },
    { type: "CNAME", name: `www.${ZONE_NAME}`, content: RAILWAY_APP_ORIGIN_HOST, proxied: true, ttl: auto },
    // DNS-only (grey) — Railway diagnostic hostname, keep until the ticket resolves.
    { type: "CNAME", name: `app.${ZONE_NAME}`, content: "571meb3y.up.railway.app", proxied: false, ttl: auto },
    // Resend (mail.tensixtythree.com verified sender).
    { type: "MX", name: `send.mail.${ZONE_NAME}`, content: "feedback-smtp.us-east-1.amazonses.com", priority: 10, proxied: false, ttl: auto },
    { type: "TXT", name: `send.mail.${ZONE_NAME}`, content: "v=spf1 include:amazonses.com ~all", proxied: false, ttl: auto },
    { type: "TXT", name: `resend._domainkey.mail.${ZONE_NAME}`, content: RESEND_DKIM, proxied: false, ttl: auto },
    { type: "TXT", name: `_dmarc.${ZONE_NAME}`, content: "v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;", proxied: false, ttl: auto },
    // GoDaddy leftovers (pay links + Domain Connect) — harmless, keep.
    { type: "CNAME", name: `pay.${ZONE_NAME}`, content: "paylinks.commerce.godaddy.com", proxied: false, ttl: auto },
    { type: "CNAME", name: `_domainconnect.${ZONE_NAME}`, content: "_domainconnect.gd.domaincontrol.com", proxied: false, ttl: auto },
  ];
}

export function recordKey(r: { type: string; name: string }): string {
  return `${r.type} ${r.name}`;
}

/** Cloudflare returns TXT content wrapped in quotes; compare unwrapped. */
export function normalizeTxt(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizedContent(r: { type: string; content: string }): string {
  return r.type === "TXT" ? normalizeTxt(r.content) : r.content.replace(/\.$/, "");
}

function matches(existing: ExistingDnsRecord, desired: DnsRecord): boolean {
  return (
    normalizedContent(existing) === normalizedContent(desired) &&
    Boolean(existing.proxied) === desired.proxied &&
    (desired.priority === undefined || existing.priority === desired.priority)
  );
}

export interface RecordPlan {
  create: DnsRecord[];
  update: { id: string; record: DnsRecord }[];
  unchanged: ExistingDnsRecord[];
}

/**
 * Upsert-only diff keyed on (type, name). Records Cloudflare has that we do
 * not know about are left alone — this script never deletes.
 */
export function planRecordChanges(
  existing: ExistingDnsRecord[],
  desired: DnsRecord[],
): RecordPlan {
  const byKey = new Map(existing.map((r) => [recordKey(r), r]));
  const plan: RecordPlan = { create: [], update: [], unchanged: [] };
  for (const record of desired) {
    const current = byKey.get(recordKey(record));
    if (!current) plan.create.push(record);
    else if (matches(current, record)) plan.unchanged.push(current);
    else plan.update.push({ id: current.id, record });
  }
  return plan;
}

/** Type-strip infra/cloudflare/edge-worker.ts into an uploadable ES module. */
export function transpileWorker(): string {
  const source = readFileSync(
    path.join(__dirname, "edge-worker.ts"),
    "utf8",
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      removeComments: true,
    },
    fileName: "edge-worker.ts",
  });
  return outputText;
}
