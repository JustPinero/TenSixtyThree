import { describe, it, expect } from "vitest";
import { guardDecision, isPublicPath } from "./route-guard";

describe("isPublicPath", () => {
  it("signin, auth endpoints, health, and Next static are public", () => {
    for (const p of [
      "/signin",
      "/api/auth/sign-in/email",
      "/api/auth/callback/github",
      "/api/health",
      "/_next/static/chunks/main.js",
      "/favicon-32.png",
      "/portraits/sage/idle.jpg",
      "/delamain.jpg",
    ]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });

  it("webhook ingest is public to middleware (it has its own secret auth)", () => {
    expect(isPublicPath("/api/webhook/session-complete")).toBe(true);
  });

  it("demo entry is public (54.5)", () => {
    expect(isPublicPath("/api/demo")).toBe(true);
    expect(isPublicPath("/api/demo/status")).toBe(true);
  });

  it("app pages and APIs are guarded", () => {
    for (const p of [
      "/",
      "/settings",
      "/templates",
      "/api/projects",
      "/api/overseer/chat",
      "/api/templates",
      "/api/dispatch/all",
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });
});

describe("guardDecision", () => {
  it("allows everything when auth is not required", () => {
    expect(
      guardDecision({ path: "/", hasSessionCookie: false, authRequired: false })
        .kind,
    ).toBe("allow");
  });

  it("allows public paths without a cookie", () => {
    expect(
      guardDecision({
        path: "/signin",
        hasSessionCookie: false,
        authRequired: true,
      }).kind,
    ).toBe("allow");
  });

  it("redirects guarded pages without a cookie to /signin", () => {
    const d = guardDecision({
      path: "/settings",
      hasSessionCookie: false,
      authRequired: true,
    });
    expect(d.kind).toBe("redirect");
  });

  it("401s guarded APIs without a cookie", () => {
    expect(
      guardDecision({
        path: "/api/projects",
        hasSessionCookie: false,
        authRequired: true,
      }).kind,
    ).toBe("401");
  });

  it("allows guarded paths with a session cookie (real check stays server-side)", () => {
    expect(
      guardDecision({
        path: "/api/projects",
        hasSessionCookie: true,
        authRequired: true,
      }).kind,
    ).toBe("allow");
  });
});
