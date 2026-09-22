/**
 * 54.1 — optimistic auth gate (Edge middleware).
 *
 * Decision logic lives in lib/route-guard.ts (pure, tested). This layer
 * only reacts to session-cookie PRESENCE: pages bounce to /signin, APIs
 * 401. Real session validation stays server-side in requireSession — a
 * forged cookie passes here and dies at the route.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDecision } from "@/lib/route-guard";
import {
  CLIENT_IP_HEADER,
  EDGE_SECRET_HEADER,
  edgeGate,
  resolveClientIp,
} from "@/lib/client-ip";

const SESSION_COOKIE = "better-auth.session_token";

export function middleware(request: NextRequest) {
  // Cloudflare move — reject requests that skipped the Worker (when the
  // shared secret is configured) and pin the real client IP for every
  // downstream rate limiter. See lib/client-ip.ts.
  const edgeSecret = process.env.EDGE_SHARED_SECRET;
  const gate = edgeGate({
    path: request.nextUrl.pathname,
    configuredSecret: edgeSecret,
    presentedSecret: request.headers.get(EDGE_SECRET_HEADER),
  });
  if (gate === "reject") {
    return NextResponse.json(
      { error: "Direct origin access is disabled; use https://www.tensixtythree.com" },
      { status: 403 },
    );
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CLIENT_IP_HEADER, resolveClientIp(request.headers, edgeSecret).ip);
  requestHeaders.delete(EDGE_SECRET_HEADER);

  const decision = guardDecision({
    path: request.nextUrl.pathname,
    hasSessionCookie:
      request.cookies.has(SESSION_COOKIE) ||
      // Secure-cookie prefix variant in production
      request.cookies.has(`__Secure-${SESSION_COOKIE}`),
    authRequired: process.env.AUTH_REQUIRED === "true",
  });

  if (decision.kind === "redirect") {
    const url = request.nextUrl.clone();
    url.pathname = decision.to;
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (decision.kind === "401") {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Everything except Next internals/static — route-guard re-checks
  // specifics (public files, auth mount, health, webhook).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
