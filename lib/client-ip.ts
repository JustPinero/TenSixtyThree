/**
 * Proxy-aware client IP + edge trust (Cloudflare move, 2026-09-22).
 *
 * Topology: browser → Cloudflare (Worker `tensixtythree-edge`) → Railway
 * edge → this app. Railway appends ITS peer to x-forwarded-for, and that
 * peer is now Cloudflare's egress — so "last hop" (the Bughunt-1.0 rule)
 * collapses every visitor into one bucket. Cloudflare's `cf-connecting-ip`
 * is the real client, but the origin hostname is public, so that header
 * is forgeable by anyone who skips Cloudflare.
 *
 * Resolution: the Worker sends `x-edge-secret` (a secret binding). Only
 * when it matches EDGE_SHARED_SECRET is `cf-connecting-ip` trusted; the
 * middleware then writes the answer to `x-client-ip` for every route and
 * (when the secret is configured) rejects requests that skipped the edge.
 * No secret configured (local dev, pre-rollout) → old behavior, no gate.
 */

export const EDGE_SECRET_HEADER = "x-edge-secret";
export const CLIENT_IP_HEADER = "x-client-ip";
/** Railway's healthcheck hits the origin directly and must never be gated. */
const GATE_EXEMPT_PATHS = new Set(["/api/health"]);

export interface ClientIpResolution {
  ip: string;
  source: "edge" | "proxy" | "none";
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function edgeVerified(headers: Headers, configuredSecret: string | undefined): boolean {
  if (!configuredSecret) return false;
  const presented = headers.get(EDGE_SECRET_HEADER);
  return presented !== null && constantTimeEqual(presented, configuredSecret);
}

export function lastForwardedHop(headers: Headers): string | null {
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  return hops.length > 0 ? hops[hops.length - 1] : null;
}

export function resolveClientIp(
  headers: Headers,
  configuredSecret: string | undefined,
): ClientIpResolution {
  if (edgeVerified(headers, configuredSecret)) {
    const cf = headers.get("cf-connecting-ip")?.trim();
    if (cf) return { ip: cf, source: "edge" };
  }
  const hop = lastForwardedHop(headers);
  if (hop) return { ip: hop, source: "proxy" };
  return { ip: "local", source: "none" };
}

export interface EdgeGateInput {
  path: string;
  configuredSecret: string | undefined;
  presentedSecret: string | null;
}

/** "reject" = request reached the origin without passing through the Worker. */
export function edgeGate(input: EdgeGateInput): "allow" | "reject" {
  if (!input.configuredSecret) return "allow";
  if (GATE_EXEMPT_PATHS.has(input.path)) return "allow";
  if (input.presentedSecret === null) return "reject";
  return constantTimeEqual(input.presentedSecret, input.configuredSecret) ? "allow" : "reject";
}
