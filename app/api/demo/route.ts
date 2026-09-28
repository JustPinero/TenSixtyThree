/**
 * 54.5 — "Try the demo": mint an ephemeral sandbox and sign the visitor
 * in. Public endpoint (route-guard) with a tight IP rate limit; every
 * start also sweeps demo identities older than 24h.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { seedDemo, cleanupDemo } from "@/lib/demo";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limiter";

const SESSION_COOKIE = "better-auth.session_token";

/**
 * 57.1 — match the name Better Auth itself would use. It adds the
 * `__Secure-` prefix whenever its baseURL is https, so on the hosted
 * deploy a demo cookie written under the bare name is a second, divergent
 * convention. One name, chosen the same way, for both session kinds.
 */
function sessionCookieName(): string {
  const https = (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");
  return https ? `__Secure-${SESSION_COOKIE}` : SESSION_COOKIE;
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(getRateLimitKey(request, "demo"), 3, 3600_000);
  if (limited) return limited;
  // Bughunt 1.0: per-IP keys can be gamed; a global ceiling bounds the
  // worst case (each mint seeds ~15 rows) regardless of header tricks.
  const globalLimited = checkRateLimit("demo:global", 60, 3600_000);
  if (globalLimited) return globalLimited;

  await cleanupDemo(prisma);
  const demo = await seedDemo(prisma);

  const res = NextResponse.json({ ok: true });
  const cookieName = sessionCookieName();
  res.cookies.set(cookieName, `${demo.sessionToken}.demo`, {
    httpOnly: true,
    sameSite: "lax",
    // __Secure- is only legal on a secure origin; keep them consistent.
    secure:
      cookieName.startsWith("__Secure-") ||
      process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 2 * 3600,
  });
  return res;
}
