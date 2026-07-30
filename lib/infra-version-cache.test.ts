/**
 * [41.D3] — the ~/.claude.json trust map is parsed once per (path, mtime),
 * not once per project, across scan/briefing/webhook paths.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  __trustParseCountForTests,
  __resetTrustCacheForTests,
  readWorkspaceTrustCached,
} from "./infra-version";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
  __resetTrustCacheForTests();
});

describe("trust-map parse cache", () => {
  it("parses the config file once for many project lookups", async () => {
    dir = mkdtempSync(join(tmpdir(), "trust-"));
    const cfg = join(dir, "claude.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        projects: { "/p/alpha": { hasTrustDialogAccepted: true } },
      })
    );
    __resetTrustCacheForTests();
    await readWorkspaceTrustCached(cfg, "/p/alpha");
    await readWorkspaceTrustCached(cfg, "/p/beta");
    await readWorkspaceTrustCached(cfg, "/p/gamma");
    expect(__trustParseCountForTests()).toBe(1);
  });

  it("re-parses when the file mtime changes", async () => {
    dir = mkdtempSync(join(tmpdir(), "trust-"));
    const cfg = join(dir, "claude.json");
    writeFileSync(cfg, JSON.stringify({ projects: {} }));
    __resetTrustCacheForTests();
    await readWorkspaceTrustCached(cfg, "/p/a");
    const future = new Date(Date.now() + 5000);
    utimesSync(cfg, future, future);
    await readWorkspaceTrustCached(cfg, "/p/a");
    expect(__trustParseCountForTests()).toBe(2);
  });
});
