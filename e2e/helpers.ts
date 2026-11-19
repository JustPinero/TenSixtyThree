/** Shared e2e helpers (phase 71). */
import fs from "node:fs";
import path from "node:path";
import type { BrowserContext } from "@playwright/test";

/** Every static page route, read from the filesystem so new pages are covered. */
export function staticRoutes(): string[] {
  const appDir = path.resolve(__dirname, "..", "app");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (
        entry.name.startsWith("[") ||
        entry.name.startsWith("(") ||
        entry.name === "api" ||
        entry.name === "components"
      )
        continue;
      const full = path.join(dir, entry.name);
      if (fs.existsSync(path.join(full, "page.tsx"))) {
        out.push("/" + path.relative(appDir, full).split(path.sep).join("/"));
      }
      walk(full);
    }
  };
  walk(appDir);
  return ["/", ...out.sort()];
}

/** Where e2e/global-setup.ts saves the single demo session for the run. */
export const DEMO_STATE_PATH = path.resolve(__dirname, ".auth", "demo.json");

/** Use the run's demo session (minted once by global-setup). */
export async function applyDemoSession(context: BrowserContext) {
  const state = JSON.parse(fs.readFileSync(DEMO_STATE_PATH, "utf8")) as {
    cookies: Parameters<BrowserContext["addCookies"]>[0];
  };
  await context.addCookies(state.cookies);
}
