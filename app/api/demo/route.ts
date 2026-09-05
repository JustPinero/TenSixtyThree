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

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(getRateLimitKey(request, "demo"), 3, 3600_000);
  if (limited) return limited;

  await cleanupDemo(prisma);
  const demo = await seedDemo(prisma);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, `${demo.sessionToken}.demo`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 2 * 3600,
  });
  return res;
}
