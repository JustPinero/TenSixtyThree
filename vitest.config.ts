import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    // Phase 52 — rig setup/teardown (CREATE DATABASE ... TEMPLATE / DROP)
    // serializes behind advisory lock 1063; with ~20 rig-based files the
    // default 10s hook/test timeouts flake under full-suite contention.
    hookTimeout: 30_000,
    testTimeout: 30_000,
    /*
     * [1.0.D1] — bound the worker pool. Vitest defaults to one fork per
     * CPU (12 here); each fork loads its own Prisma client and opens its
     * own Postgres connections, and the peak drove a 32GB machine to
     * ~0.1GB free. Under that pressure rig `beforeAll` hooks blew the
     * 30s timeout at random: four runs of one unchanged commit gave 0, 2,
     * 9 and 9 failing files, and a later run was killed outright by the
     * OS for low memory. Capping the pool trades a little wall-clock for
     * a suite whose result means something.
     */
    maxWorkers: 2,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e"],
    // Phase 23.7 — push schema to a template DB once per test run.
    // Rigs copy this template instead of re-pushing per-test, which
    // serializes the Prisma client regen and prevents flaky races
    // across parallel test workers.
    globalSetup: ["./tests/harness/global-setup.ts"],
    // Phase 42 (P0.1) — the webhook-ingest containment guard refuses
    // projectPaths outside PROJECTS_DIR. Tests use "/p/..." fake paths
    // by convention, so the suite runs with /p as the managed root.
    // Files needing a different root set process.env themselves.
    env: {
      PROJECTS_DIR: "/p",
      // [42.D1] keep webhook tests in open mode regardless of the real machine secret
      CASCADE_WEBHOOK_SECRET_PATH: "/p/nonexistent-webhook-secret",
    },
  },
  resolve: {
    alias: {
      // Phase 51.1 — legacy test files still import the sqlite adapter by
      // name; alias it to the Postgres compat shim (per-file template-cloned
      // DBs). See lib/__test-utils__/pg-file-url-compat.ts.
      "@prisma/adapter-better-sqlite3": path.resolve(
        __dirname,
        "lib/__test-utils__/pg-file-url-compat.ts"
      ),
      "@": path.resolve(__dirname, "."),
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
  },
});
