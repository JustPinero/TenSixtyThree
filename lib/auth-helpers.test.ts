/**
 * Phase 51.2 — Better Auth foundation: server session helpers + schema.
 * AC2/AC3/AC4 from requests/phase-51-hosted/51.2-better-auth.md.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { getServerSession, requireSession } from "./auth-helpers";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  delete process.env.AUTH_REQUIRED;
});

function headersWith(token?: string): Headers {
  const h = new Headers();
  if (token) h.set("cookie", `better-auth.session_token=${token}`);
  return h;
}

describe("AC4 — Better Auth schema present", () => {
  it("user/session/account/verification models exist and accept rows", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const user = await rig.prisma.user.create({
      data: { email: "a@b.c", name: "A", emailVerified: false },
    });
    expect(user.id).toBeTruthy(); // cuid default
    const session = await rig.prisma.session.create({
      data: {
        userId: user.id,
        token: "tok_test_123",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    expect(session.token).toBe("tok_test_123");
    expect(await rig.prisma.account.count()).toBe(0);
    expect(await rig.prisma.verification.count()).toBe(0);
  });
});

describe("AC2 — getServerSession", () => {
  it("returns null for anonymous requests", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const session = await getServerSession(rig.prisma, headersWith());
    expect(session).toBeNull();
  });

  it("returns the session for a valid unexpired token", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const user = await rig.prisma.user.create({
      data: { email: "j@t.dev", name: "J", emailVerified: true },
    });
    await rig.prisma.session.create({
      data: {
        userId: user.id,
        token: "tok_valid",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const session = await getServerSession(
      rig.prisma,
      headersWith("tok_valid"),
    );
    expect(session?.user.email).toBe("j@t.dev");
  });

  it("returns null for an expired token", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const user = await rig.prisma.user.create({
      data: { email: "x@t.dev", name: "X", emailVerified: true },
    });
    await rig.prisma.session.create({
      data: {
        userId: user.id,
        token: "tok_expired",
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const session = await getServerSession(
      rig.prisma,
      headersWith("tok_expired"),
    );
    expect(session).toBeNull();
  });
});

describe("AC3 — requireSession honors AUTH_REQUIRED", () => {
  it("passes anonymous through when AUTH_REQUIRED is unset (local single-user mode)", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const result = await requireSession(rig.prisma, headersWith());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session).toBeNull();
  });

  it("rejects anonymous with 401 semantics when AUTH_REQUIRED=true", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    process.env.AUTH_REQUIRED = "true";
    const result = await requireSession(rig.prisma, headersWith());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("accepts a valid session when AUTH_REQUIRED=true", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    process.env.AUTH_REQUIRED = "true";
    const user = await rig.prisma.user.create({
      data: { email: "ok@t.dev", name: "OK", emailVerified: true },
    });
    await rig.prisma.session.create({
      data: {
        userId: user.id,
        token: "tok_ok",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const result = await requireSession(rig.prisma, headersWith("tok_ok"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session?.user.email).toBe("ok@t.dev");
  });
});

/**
 * Phase 57.1 — Better Auth prefixes its cookie with `__Secure-` whenever
 * the base URL is https (node_modules/better-auth/dist/cookies: the
 * prefix is chosen from baseURL's protocol). The hosted deploy has been
 * https since day one, so the browser sent
 * `__Secure-better-auth.session_token` while these helpers matched only
 * the bare name — every requireSession route 401'd a real signed-in
 * account. middleware.ts already checked both names, so pages loaded and
 * only the data calls failed.
 */
describe("57.1 — __Secure- cookie prefix (hosted)", () => {
  function headersWithRaw(cookie: string): Headers {
    const h = new Headers();
    h.set("cookie", cookie);
    return h;
  }

  async function seedSession(token: string) {
    rig = await createDispatchRig({ fakeTimers: false });
    const user = await rig.prisma.user.create({
      data: { email: "secure@t.dev", name: "S", emailVerified: true },
    });
    await rig.prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
  }

  it("resolves a session sent under the __Secure- prefixed name", async () => {
    await seedSession("tok_secure");
    const session = await getServerSession(
      rig!.prisma,
      headersWithRaw("__Secure-better-auth.session_token=tok_secure"),
    );
    expect(session?.user.email).toBe("secure@t.dev");
  });

  it("still resolves the unprefixed name (local http dev, demo sessions)", async () => {
    await seedSession("tok_plain");
    const session = await getServerSession(
      rig!.prisma,
      headersWithRaw("better-auth.session_token=tok_plain"),
    );
    expect(session?.user.email).toBe("secure@t.dev");
  });

  it("prefers the __Secure- cookie when a stale unprefixed one is also sent", async () => {
    await seedSession("tok_secure");
    const session = await getServerSession(
      rig!.prisma,
      headersWithRaw(
        "better-auth.session_token=tok_stale; __Secure-better-auth.session_token=tok_secure",
      ),
    );
    expect(session?.user.email).toBe("secure@t.dev");
  });

  it("strips the signature suffix under either name", async () => {
    await seedSession("tok_secure");
    const session = await getServerSession(
      rig!.prisma,
      headersWithRaw(
        "__Secure-better-auth.session_token=tok_secure.s1gn4tur3",
      ),
    );
    expect(session?.user.email).toBe("secure@t.dev");
  });

  it("ignores a cookie whose name merely ends with the session name", async () => {
    await seedSession("tok_secure");
    const session = await getServerSession(
      rig!.prisma,
      headersWithRaw("evil-better-auth.session_token=tok_secure"),
    );
    expect(session).toBeNull();
  });
});
