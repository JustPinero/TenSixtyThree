/**
 * 65.1 — redact credentials from any text the runner stores or logs
 * (Dispatch.errorMessage, ActivityEvent summaries, PR bodies, console).
 *
 * Defence in depth: credentials should never reach a URL or argv in the
 * first place (lib/runner/git-ops.ts passes them through env), but git,
 * the SDK and fetch all echo inputs into error messages.
 */
const REDACTED = "[redacted]";

const PATTERNS: RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{10,}/g,
  /\b(authorization:\s*(?:basic|bearer|token)\s+)[^\s"',]+/gi,
  // Phase 74 — any PEM private key (the GitHub App key), real or \n-escaped newlines.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

/** Env vars whose literal values must never appear in output. */
const SECRET_ENV = [
  "GITHUB_TOKEN",
  "ANTHROPIC_API_KEY",
  "ENCRYPTION_KEY",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "OPS_SECRET",
  "EDGE_SHARED_SECRET",
  "GITHUB_APP_PRIVATE_KEY",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrubSecrets(text: string, extra: string[] = []): string {
  let out = text;
  const values = [...SECRET_ENV.map((k) => process.env[k]), ...extra].flatMap((v) =>
    // A PEM stored \n-escaped can surface with real newlines, and vice versa.
    v && v.includes("\\n") ? [v, v.replace(/\\n/g, "\n")] : [v],
  );
  for (const value of values) {
    if (value && value.length >= 8) {
      out = out.replace(new RegExp(escapeRegExp(value), "g"), REDACTED);
    }
  }
  // scheme://user:pass@host → scheme://[redacted]@host
  out = out.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, `$1${REDACTED}@`);
  for (const re of PATTERNS) {
    out = out.replace(re, (_match, prefix?: string) =>
      typeof prefix === "string" ? `${prefix}${REDACTED}` : REDACTED,
    );
  }
  return out;
}
