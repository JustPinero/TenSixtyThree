/**
 * Phase 71 — mint ONE demo session per Playwright run and save it to disk.
 *
 * /api/demo allows 3 mints per IP per hour (in-memory limiter). Minting in
 * a spec's beforeAll ran once per worker AND again after every failure
 * (Playwright restarts the worker, so beforeAll re-runs), which tripped
 * the 429 after a couple of retries and masked the real failures. The
 * webServer is already up when globalSetup runs.
 */
import fs from "node:fs";
import path from "node:path";
import { request, type FullConfig } from "@playwright/test";
import { DEMO_STATE_PATH } from "./helpers";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${baseURL}/api/demo`);
    if (!res.ok()) throw new Error(`demo mint failed: ${res.status()}`);
    fs.mkdirSync(path.dirname(DEMO_STATE_PATH), { recursive: true });
    await ctx.storageState({ path: DEMO_STATE_PATH });
  } finally {
    await ctx.dispose();
  }
}
