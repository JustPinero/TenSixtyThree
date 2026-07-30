/**
 * Phase 46.1 — quarantine surfacing (+ [41.D8] empty/missing-spool coverage).
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readQuarantineStatus } from "./webhook-spool";
import { drainWebhookSpool } from "./webhook-spool";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("quarantine surfacing", () => {
  it("reports zero for a missing quarantine file", () => {
    dir = mkdtempSync(join(tmpdir(), "q-"));
    const status = readQuarantineStatus(join(dir, "spool.jsonl"));
    expect(status.count).toBe(0);
    expect(status.lastLine).toBeNull();
  });

  it("reports count and last line when quarantined entries exist", () => {
    dir = mkdtempSync(join(tmpdir(), "q-"));
    const spool = join(dir, "spool.jsonl");
    writeFileSync(`${spool}.quarantine`, "bad-line-1\nbad-line-2\n");
    const status = readQuarantineStatus(spool);
    expect(status.count).toBe(2);
    expect(status.lastLine).toBe("bad-line-2");
  });

  it("[41.D8] drain of a missing spool is a clean no-op", async () => {
    dir = mkdtempSync(join(tmpdir(), "q-"));
    const result = await drainWebhookSpool({
      spoolPath: join(dir, "never-created.jsonl"),
      ingest: async () => ({ ok: true }),
    } as never);
    expect(result.ingested).toBe(0);
    expect(result.skipped).toBe(0);
  });
});
