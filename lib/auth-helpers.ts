/**
 * Phase 51.2 — server-side session helpers.
 *
 * Wraps session lookup in a prisma-injected, test-friendly seam (the full
 * Better Auth `auth.api.getSession` needs the whole auth instance; these
 * helpers do the same cookie→session→user resolution against the DB so
 * routes and tests can check auth without booting the OAuth machinery).
 *
 * Local-first compatibility: `requireSession` only enforces when
 * AUTH_REQUIRED=true — the single-operator local mode keeps working
 * unauthenticated until the hosted deploy flips the flag (51.4).
 */
import type { PrismaClient } from "@/app/generated/prisma/client";

export interface ServerSession {
  user: { id: string; email: string; name: string };
  session: {
    token: string;
    expiresAt: Date;
    activeOrganizationId: string | null;
  };
}

const SESSION_COOKIE = "better-auth.session_token";

function tokenFromHeaders(headers: Headers): string | null {
  const cookie = headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      // Better Auth signs cookies as `${token}.${signature}` — the DB stores
      // the bare token, so strip any signature suffix.
      const raw = decodeURIComponent(rest.join("="));
      return raw.split(".")[0] || null;
    }
  }
  return null;
}

export async function getServerSession(
  prisma: PrismaClient,
  headers: Headers,
): Promise<ServerSession | null> {
  const token = tokenFromHeaders(headers);
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
    session: {
      token: session.token,
      expiresAt: session.expiresAt,
      activeOrganizationId: session.activeOrganizationId,
    },
  };
}

export type RequireSessionResult =
  | { ok: true; session: ServerSession | null }
  | { ok: false; status: 401; error: string };

export async function requireSession(
  prisma: PrismaClient,
  headers: Headers,
): Promise<RequireSessionResult> {
  const session = await getServerSession(prisma, headers);
  const required = process.env.AUTH_REQUIRED === "true";
  if (!required) return { ok: true, session };
  if (!session)
    return { ok: false, status: 401, error: "Authentication required" };
  return { ok: true, session };
}
