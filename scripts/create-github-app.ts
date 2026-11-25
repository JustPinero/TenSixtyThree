/**
 * Phase 74 — create the TenSixtyThree GitHub App in one click (operator tool).
 *
 *   pnpm exec tsx scripts/create-github-app.ts
 *
 * Opens a local page that hands GitHub the app definition
 * (lib/github-app-manifest.ts). You click "Create GitHub App"; GitHub sends
 * a one-time code back to this script, which exchanges it for the app's
 * credentials and saves them straight into 1Password
 * (Cascade → "TenSixtyThree GitHub App"). No secret is printed or typed.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAppManifest } from "../lib/github-app-manifest";

const VAULT = "Cascade";
const TITLE = "TenSixtyThree GitHub App";
const state = randomBytes(16).toString("hex");

interface Conversion {
  id: number;
  slug: string;
  html_url: string;
  pem: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function saveTo1Password(app: Conversion): void {
  const dir = mkdtempSync(join(tmpdir(), "gh-app-"));
  const file = join(dir, "item.json");
  try {
    const field = (label: string, value: string, concealed = false) => ({
      id: label,
      label,
      type: concealed ? "CONCEALED" : "STRING",
      value,
    });
    writeFileSync(
      file,
      JSON.stringify({
        title: TITLE,
        category: "API_CREDENTIAL",
        fields: [
          field("app_id", String(app.id)),
          field("slug", app.slug),
          field("url", app.html_url),
          field("client_id", app.client_id),
          field("private_key", app.pem, true),
          field("client_secret", app.client_secret, true),
        ],
      }),
      { mode: 0o600 },
    );
    chmodSync(file, 0o600);
    execFileSync(
      "op",
      ["item", "create", "--vault", VAULT, "--template", file],
      {
        stdio: ["ignore", "ignore", "inherit"],
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const port = (server.address() as { port: number }).port;

  if (url.pathname === "/") {
    const manifest = buildAppManifest(`http://127.0.0.1:${port}/callback`);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Create GitHub App</title>
<body style="font:16px system-ui;margin:3rem">
<p>Sending you to GitHub to create the <b>TenSixtyThree Runner</b> app…</p>
<form id="f" method="post" action="https://github.com/settings/apps/new?state=${state}">
<input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
<button type="submit">Continue to GitHub</button></form>
<script>document.getElementById("f").submit()</script></body>`);
    return;
  }

  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    if (
      url.searchParams.get("state") !== state ||
      !code ||
      !/^[\w-]+$/.test(code)
    ) {
      res.writeHead(400).end("Bad callback");
      return;
    }
    void (async () => {
      try {
        const r = await fetch(
          `https://api.github.com/app-manifests/${code}/conversions`,
          {
            method: "POST",
            headers: { Accept: "application/vnd.github+json" },
          },
        );
        if (!r.ok) throw new Error(`GitHub conversion failed: ${r.status}`);
        const app = (await r.json()) as Conversion;
        saveTo1Password(app);
        console.log(`Created GitHub App id=${app.id} slug=${app.slug}`);
        console.log(`Saved to 1Password: ${VAULT} → ${TITLE}`);
        console.log(`App page: ${app.html_url}`);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<body style="font:16px system-ui;margin:3rem"><h2>Done ✓</h2>
<p>The app is created and its keys are in 1Password. You can close this tab and tell Kilroy.</p></body>`);
        server.close();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        res.writeHead(500).end("Something went wrong; check the terminal.");
        server.close();
        process.exitCode = 1;
      }
    })();
    return;
  }
  res.writeHead(404).end();
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address() as { port: number };
  const start = `http://127.0.0.1:${port}/`;
  console.log(`Opening ${start} — click "Create GitHub App" on GitHub.`);
  spawnSync("open", [start]);
});
setTimeout(() => {
  console.error("Timed out after 15 minutes waiting for GitHub.");
  process.exit(1);
}, 15 * 60_000).unref();
