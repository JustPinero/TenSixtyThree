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

const SESSION_COOKIE = "better-auth.session_token";

export function middleware(request: NextRequest) {
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
  return NextResponse.next();
}

export const config = {
  // Everything except Next internals/static — route-guard re-checks
  // specifics (public files, auth mount, health, webhook).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
