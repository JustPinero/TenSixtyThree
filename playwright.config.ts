import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Phase 23.8 — local dev uses `pnpm dev` (1Password resolves
    // secrets); CI uses `dev:ci` which skips `op run` since 1Password
    // CLI isn't available in GitHub Actions runners. The existing
    // smoke specs don't exercise Anthropic call paths, so a fake key
    // is enough to satisfy startup validation.
    command: process.env.CI ? "pnpm dev:ci" : "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    env: process.env.CI
      ? {
          ANTHROPIC_API_KEY: "sk-ant-ci-fake-key-not-used-by-smoke-specs",
          // Phase 57.2 — this used to hardcode `file:./test-e2e.db`.
          // SQLite was retired in Phase 51, so the dev server booted with
          // a file URL against the pg adapter and every request died with
          // ECONNREFUSED. Inherit the workflow's DATABASE_URL instead.
          DATABASE_URL:
            process.env.DATABASE_URL ??
            "postgresql://tensixtythree:tensixtythree@127.0.0.1:51063/tensixtythree",
        }
      : undefined,
    timeout: 120_000,
  },
});
