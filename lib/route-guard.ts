/**
 * 54.1 — middleware route guard (pure).
 *
 * Optimistic gate only: classifies paths and reacts to session-cookie
 * PRESENCE. Real session validation stays server-side (lib/auth-helpers'
 * requireSession) — a forged cookie gets past middleware and then 401s
 * at the route. Public list is deliberately narrow.
 */

const PUBLIC_PREFIXES = [
  "/signin",
  "/api/auth/", // Better Auth mount — its own flows handle security
  "/api/health", // deploy healthcheck must stay unauthenticated (51.4)
  "/api/webhook/session-complete", // shared-secret auth of its own (42.x)
  "/api/demo", // 54.5 — demo entry + status (rate-limited, mints its own session)
  "/_next/",
];

/** Static assets served from /public (images, fonts, icons). */
const PUBLIC_FILE = /\.(?:jpg|jpeg|png|svg|gif|webp|ico|txt|xml|woff2?)$/;

export function isPublicPath(path: string): boolean {
  if (PUBLIC_FILE.test(path)) return true;
  return PUBLIC_PREFIXES.some(
    (p) => path === p || path === p.replace(/\/$/, "") || path.startsWith(p),
  );
}

export interface GuardInput {
  path: string;
  hasSessionCookie: boolean;
  authRequired: boolean;
}

export type GuardDecision =
  { kind: "allow" } | { kind: "redirect"; to: "/signin" } | { kind: "401" };

export function guardDecision(input: GuardInput): GuardDecision {
  if (!input.authRequired) return { kind: "allow" };
  if (isPublicPath(input.path)) return { kind: "allow" };
  if (input.hasSessionCookie) return { kind: "allow" };
  if (input.path.startsWith("/api/")) return { kind: "401" };
  return { kind: "redirect", to: "/signin" };
}
