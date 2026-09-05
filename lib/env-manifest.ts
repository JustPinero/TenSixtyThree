/**
 * Phase 51.4 — declarative manifest of every env var the app reads.
 *
 * Scopes:
 *  - hosted-required: the hosted control plane cannot boot (or cannot auth)
 *    without it — Railway deploys must set all of these.
 *  - hosted-optional: enables a feature on the hosted instance; absence
 *    degrades gracefully.
 *  - local-only: only meaningful on an operator machine with a filesystem
 *    fleet (PROJECTS_DIR scans, dispatcher shell-outs, Stop-hook spool).
 *
 * The inventory test in env-manifest.test.ts pins this list to the actual
 * `process.env.*` reads in app/lib/scripts — extend BOTH when adding a var.
 */

export type EnvScope = "hosted-required" | "hosted-optional" | "local-only";

export interface EnvVarSpec {
  name: string;
  scope: EnvScope;
  description: string;
}

export const ENV_MANIFEST: EnvVarSpec[] = [
  // ── boot-critical ──────────────────────────────────────────────────────
  {
    name: "DATABASE_URL",
    scope: "hosted-required",
    description:
      "Postgres connection string (Railway: reference the attached Postgres service).",
  },
  {
    name: "ANTHROPIC_API_KEY",
    scope: "hosted-required",
    description: "Claude API key for the Overseer chat and briefing engines.",
  },
  // ── auth (51.2) ────────────────────────────────────────────────────────
  {
    name: "BETTER_AUTH_SECRET",
    scope: "hosted-required",
    description:
      "Better Auth signing secret (openssl rand -base64 32; never reuse the local one in prod).",
  },
  {
    name: "BETTER_AUTH_URL",
    scope: "hosted-required",
    description:
      "Public base URL of the deployment (https://<app>.up.railway.app until the domain lands).",
  },
  {
    name: "AUTH_REQUIRED",
    scope: "hosted-required",
    description:
      'Set "true" on hosted instances to enforce sessions; unset/false is local single-user mode.',
  },
  {
    name: "ENCRYPTION_KEY",
    scope: "hosted-required",
    description:
      "54.2 — 32-byte base64 secret sealing BYOK Anthropic keys at rest (openssl rand -base64 32). Rotating it orphans stored keys (users re-enter).",
  },
  {
    name: "RESEND_API_KEY",
    scope: "hosted-optional",
    description:
      "54.2 — Resend API key for invite/OTP email. Unset: emails are logged to the server console instead (dev/local mode).",
  },
  {
    name: "EMAIL_FROM",
    scope: "hosted-optional",
    description:
      '54.2 — From header for auth email. Default "TenSixtyThree <auth@mail.tensixtythree.com>".',
  },
  {
    name: "ADMIN_EMAILS",
    scope: "hosted-required",
    description:
      "54.1 — comma-separated bootstrap allowlist: these emails may create accounts without an invite and land with the admin role. Without it, an invite-only instance has no way in.",
  },
  {
    name: "GITHUB_CLIENT_ID",
    scope: "hosted-required",
    description: "GitHub OAuth App client id (primary sign-in provider).",
  },
  {
    name: "GITHUB_CLIENT_SECRET",
    scope: "hosted-required",
    description: "GitHub OAuth App client secret.",
  },
  {
    name: "GOOGLE_CLIENT_ID",
    scope: "hosted-optional",
    description: "Google OAuth client id (secondary sign-in provider).",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    scope: "hosted-optional",
    description: "Google OAuth client secret.",
  },
  // ── hosted-optional features ───────────────────────────────────────────
  {
    name: "CASCADE_CHAT_MODEL",
    scope: "hosted-optional",
    description: "Override the Overseer chat model id (defaults in code).",
  },
  {
    name: "CASCADE_AI_SERVICE",
    scope: "hosted-optional",
    description: "Select the AI service implementation (default: anthropic).",
  },
  {
    name: "VERCEL_TOKEN",
    scope: "hosted-optional",
    description: "Enables the Vercel deployment panels/integrations.",
  },
  {
    name: "RAILWAY_TOKEN",
    scope: "hosted-optional",
    description: "Enables the Railway deployment panels/integrations.",
  },
  {
    name: "ANTHROPIC_FEATURE_SOURCES",
    scope: "hosted-optional",
    description:
      "Comma list of sources for the version watcher's feature-proposal feed.",
  },
  // ── local-only (operator machine / fleet filesystem) ───────────────────
  {
    name: "PROJECTS_DIR",
    scope: "local-only",
    description:
      "Root directory of the local project fleet for health/progress scans.",
  },
  {
    name: "CASCADE_KNOWLEDGE_DIR",
    scope: "local-only",
    description: "Knowledge base directory for harvesting/brain-sync.",
  },
  {
    name: "KILROY_BRAIN_PATH",
    scope: "local-only",
    description: "Path to the shared kilroy-brain repo checkout.",
  },
  {
    name: "CASCADE_PLUGIN_JSON_PATH",
    scope: "local-only",
    description: "Path to the coqui-kickoff plugin manifest.",
  },
  {
    name: "CASCADE_CLAUDE_CONFIG_PATH",
    scope: "local-only",
    description: "Path to the operator's ~/.claude config for hook installs.",
  },
  {
    name: "CASCADE_MAX_CONCURRENT_SUBAGENTS",
    scope: "local-only",
    description: "Cap on concurrently dispatched Claude Code sessions.",
  },
  {
    name: "CASCADE_WEBHOOK_SECRET_PATH",
    scope: "local-only",
    description: "File path holding the Stop-hook webhook shared secret.",
  },
  {
    name: "CASCADE_WEBHOOK_SPOOL",
    scope: "local-only",
    description: "Spool directory for webhook payloads when the app is down.",
  },
  {
    name: "CASCADE_PORT",
    scope: "local-only",
    description: "Local dev server port override used by hook installers.",
  },
  {
    name: "TEST_PG_BASE_URL",
    scope: "local-only",
    description: "Test-harness Postgres base URL (vitest rigs only).",
  },
];

export interface HostedEnvResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

export function validateHostedEnv(
  env: Record<string, string | undefined>,
): HostedEnvResult {
  const missing = ENV_MANIFEST.filter(
    (spec) => spec.scope === "hosted-required" && !env[spec.name],
  ).map((spec) => spec.name);

  const warnings: string[] = [];
  if (env.AUTH_REQUIRED !== "true") {
    warnings.push(
      'AUTH_REQUIRED is not "true" — a hosted instance without auth enforcement is open to the internet.',
    );
  }

  return { ok: missing.length === 0, missing, warnings };
}
