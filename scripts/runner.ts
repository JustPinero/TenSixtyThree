/**
 * 52.2 — the cloud runner service entrypoint.
 *
 * Deployed as a second Railway service off the same repo: the shared
 * start:hosted script execs this when RUNNER_MODE=1. Polls for queued
 * cloud dispatches (runnerTick) and serves a minimal health endpoint so
 * Railway's shared healthcheck config passes for this service too.
 *
 * Flags/env: --once (single tick, for smoke tests), RUNNER_ID,
 * RUNNER_POLL_MS (default 5000), RUNNER_MAX_TURNS, RUNNER_MAX_BUDGET_USD,
 * GITHUB_TOKEN (private clones), PORT (health server).
 */
import { createServer } from "node:http";
import { hostname } from "node:os";
import { prisma } from "../lib/db";
import { runnerTick } from "../lib/runner/loop";
import { buildRealDeps } from "../lib/runner/real-deps";

const RUNNER_ID = process.env.RUNNER_ID ?? `${hostname()}-${process.pid}`;
const POLL_MS = Number(process.env.RUNNER_POLL_MS ?? 5000);
const once = process.argv.includes("--once");

function startHealthServer() {
  const port = Number(process.env.PORT ?? 8080);
  createServer((req, res) => {
    if (req.url?.startsWith("/api/health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", role: "runner", id: RUNNER_ID }));
      return;
    }
    res.writeHead(404);
    res.end();
  }).listen(port, () => {
    console.log(`[runner ${RUNNER_ID}] health server on :${port}`);
  });
}

async function main() {
  const deps = buildRealDeps(prisma);
  if (once) {
    const worked = await runnerTick(prisma, RUNNER_ID, deps);
    console.log(
      `[runner ${RUNNER_ID}] --once: ${worked ? "ran a dispatch" : "queue empty"}`,
    );
    process.exit(0);
  }

  startHealthServer();
  console.log(`[runner ${RUNNER_ID}] polling every ${POLL_MS}ms`);
  // Sequential by design: one CLI subprocess per runner instance;
  // scale with Railway replicas, not in-process concurrency.
  for (;;) {
    try {
      const worked = await runnerTick(prisma, RUNNER_ID, deps);
      if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (error) {
      console.error(`[runner ${RUNNER_ID}] tick failed:`, error);
      await new Promise((r) => setTimeout(r, POLL_MS * 4));
    }
  }
}

main();
