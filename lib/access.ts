/**
 * Phase 64 — the one access boundary for API routes (deny by default).
 *
 * Middleware only checks that a session cookie EXISTS (an optimistic
 * pre-filter). The guarantee lives here: every `app/api/**\/route.ts`
 * handler calls exactly one of these helpers, or is listed in
 * PUBLIC_ROUTES — enforced by lib/route-auth-coverage.test.ts.
 *
 * "Local operator" is a property of configuration (AUTH_REQUIRED unset),
 * NEVER of a missing session. Under AUTH_REQUIRED a missing, unknown, or
 * expired cookie is a 401.
 *
 * Helpers return a result instead of throwing so a route reads:
 *   const gate = await requireUser(request);
 *   if (!gate.ok) return gate.response;
 */
import { cache } from "react";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession, type ServerSession } from "@/lib/auth-helpers";
import { isDemoSession } from "@/lib/demo";

/** Routes that authenticate themselves (or need no auth by design). */
export const PUBLIC_ROUTES: readonly string[] = [
  "app/api/auth/[...all]/route.ts", // Better Auth's own flows
  "app/api/health/route.ts", // Railway healthcheck
  "app/api/demo/route.ts", // mints the demo session (rate-limited)
  "app/api/demo/status/route.ts", // reports whether the caller is a demo session
  "app/api/admin/ops/route.ts", // OPS_SECRET, constant-time
  "app/api/webhook/session-complete/route.ts", // shared-secret + loopback
  "app/api/[...notfound]/route.ts", // JSON 404 for unknown /api paths (64.5)
];

export function isHosted(): boolean {
  return process.env.AUTH_REQUIRED === "true";
}

export type Viewer =
  | { kind: "local" }
  | {
      kind: "user";
      userId: string;
      email: string;
      isAdmin: boolean;
      isDemo: boolean;
      session: ServerSession;
    };

export type UserViewer = Extract<Viewer, { kind: "user" }>;

export type Gate<V extends Viewer = Viewer> =
  { ok: true; viewer: V } | { ok: false; response: NextResponse };

function deny(
  status: 401 | 403,
  body: Record<string, unknown>,
): {
  ok: false;
  response: NextResponse;
} {
  return { ok: false, response: NextResponse.json(body, { status }) };
}

const UNAUTHENTICATED = () => deny(401, { error: "Authentication required" });

/**
 * One lookup per request. Keyed on the raw cookie header so React's
 * per-request cache dedupes repeat calls inside a server render; route
 * handlers call it once anyway.
 */
const lookup = cache(
  async (cookieHeader: string): Promise<UserViewer | null> => {
    const session = await getServerSession(
      prisma,
      new Headers(cookieHeader ? { cookie: cookieHeader } : {}),
    );
    if (!session) return null;
    return {
      kind: "user",
      userId: session.user.id,
      email: session.user.email,
      isAdmin: session.user.role === "admin",
      isDemo: isDemoSession(session),
      session,
    };
  },
);

async function resolve(request: Request): Promise<Viewer | null> {
  const user = await lookup(request.headers.get("cookie") ?? "");
  if (user) return user;
  return isHosted() ? null : { kind: "local" };
}

/**
 * Phase 66.2 — the same resolution for server components, which get a
 * Headers object (`await headers()`) instead of a Request. null = nobody
 * (hosted, no valid session).
 */
export async function viewerFromHeaders(headers: Headers): Promise<Viewer | null> {
  const user = await lookup(headers.get("cookie") ?? "");
  if (user) return user;
  return isHosted() ? null : { kind: "local" };
}

/** Any authenticated caller; local operator in local mode. */
export async function requireUser(request: Request): Promise<Gate> {
  const viewer = await resolve(request);
  if (!viewer) return UNAUTHENTICATED();
  return { ok: true, viewer };
}

/** A real account is required even in local mode (boards, orgs, BYOK). */
const DEMO_FORBIDDEN = () =>
  deny(403, { error: "Not available in the demo", demo: true });

/** `allowDemo: false` (64.4) also refuses demo sessions. */
export async function requireSignedIn(
  request: Request,
  opts: { allowDemo?: boolean } = {},
): Promise<Gate<UserViewer>> {
  const viewer = await resolve(request);
  if (!viewer || viewer.kind !== "user") return UNAUTHENTICATED();
  if (opts.allowDemo === false && viewer.isDemo) return DEMO_FORBIDDEN();
  return { ok: true, viewer };
}

/** Admin account, or the local operator. */
export async function requireAdmin(request: Request): Promise<Gate> {
  const viewer = await resolve(request);
  if (!viewer) return UNAUTHENTICATED();
  if (viewer.kind === "user" && !viewer.isAdmin) {
    return deny(403, { error: "Admin only" });
  }
  return { ok: true, viewer };
}

/** Any authenticated caller except a demo session. */
export async function requireNonDemo(request: Request): Promise<Gate> {
  const viewer = await resolve(request);
  if (!viewer) return UNAUTHENTICATED();
  if (viewer.kind === "user" && viewer.isDemo) return DEMO_FORBIDDEN();
  return { ok: true, viewer };
}

/**
 * Filesystem / shell surfaces: they act on the SERVER's disk and CLIs,
 * which on the hosted app belong to nobody's project. Refused on hosted,
 * even for admins.
 */
export async function requireLocalMode(request: Request): Promise<Gate> {
  if (isHosted()) {
    return deny(403, {
      error: "Only available when running TenSixtyThree locally",
      hostedUnsupported: true,
    });
  }
  const viewer = await resolve(request);
  return { ok: true, viewer: viewer ?? { kind: "local" } };
}

/** The user id to scope queries by; null = local operator. */
export function viewerUserId(viewer: Viewer): string | null {
  return viewer.kind === "user" ? viewer.userId : null;
}

/**
 * 64.5 — log the real error server-side; return a generic message on the
 * hosted app. Raw `error.message` leaks Prisma model/constraint names and
 * filesystem paths. The local operator still sees the detail — it is
 * their own machine and the message is usually the fix ("gh not found").
 */
export function jsonError(error: unknown, where: string, status = 500): NextResponse {
  console.error(`[api:${where}]`, error);
  const detail = !isHosted() && error instanceof Error ? error.message : null;
  return NextResponse.json(
    { error: detail ?? "Something went wrong" },
    { status },
  );
}
