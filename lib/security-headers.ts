/**
 * Phase 70 — baseline security headers for every response (next.config
 * `headers()`).
 *
 * The CSP is a baseline, not a nonce-based strict policy: Next's App
 * Router emits inline bootstrap scripts, so `script-src` keeps
 * 'unsafe-inline' (and 'unsafe-eval' in dev for React Refresh). What it
 * does buy: no third-party script/frame/object sources, no framing of the
 * app (clickjacking), no form posts or <base> hijacks off-site, and
 * fetches only back to our own origin. next/font self-hosts fonts at
 * build time; persona portraits and the speech/chime audio are local.
 */
export interface HeaderEntry {
  key: string;
  value: string;
}

export function contentSecurityPolicy(isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function securityHeaders(isDev: boolean): HeaderEntry[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Ignored by browsers over plain http (local mode); enforced on hosted.
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), geolocation=(), microphone=(self)",
    },
  ];
}
