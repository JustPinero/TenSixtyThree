/**
 * Phase 70 — local-mode request guard (pure; middleware applies it).
 *
 * With AUTH_REQUIRED unset there is no session to check, so any page in
 * the operator's browser could POST to http://127.0.0.1:3000 (CSRF) or
 * reach it through a hostname that resolves to loopback (DNS
 * rebinding). For state-changing methods we require a loopback Host and,
 * when an Origin is sent, the same origin. Origin-less requests (curl,
 * the Stop-hook webhook) stay allowed — browsers always send Origin on
 * cross-site writes.
 */
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function hostname(hostHeader: string): string {
  if (hostHeader.startsWith("[")) {
    const end = hostHeader.indexOf("]");
    return end === -1 ? hostHeader : hostHeader.slice(0, end + 1);
  }
  return hostHeader.split(":")[0];
}

export function localOriginDecision(req: {
  authRequired: boolean;
  method: string;
  host: string | null;
  origin: string | null;
}): "allow" | "reject" {
  if (req.authRequired) return "allow";
  // Security review: the Host check covers EVERY method — a rebound
  // hostname must not be able to read local data via GET either.
  const host = req.host ?? "";
  if (!LOOPBACK_HOSTS.has(hostname(host).toLowerCase())) return "reject";
  if (!STATE_CHANGING.has(req.method.toUpperCase())) return "allow";
  if (req.origin === null) return "allow";
  try {
    const origin = new URL(req.origin);
    return origin.host.toLowerCase() === host.toLowerCase()
      ? "allow"
      : "reject";
  } catch {
    return "reject"; // "null" and garbage
  }
}
