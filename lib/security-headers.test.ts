/** Phase 70 — header snapshot: a change to the baseline is a deliberate diff. */
import { describe, it, expect } from "vitest";
import { securityHeaders } from "./security-headers";
import nextConfig from "../next.config";

describe("security headers", () => {
  it("production baseline", () => {
    expect(securityHeaders(false)).toMatchInlineSnapshot(`
      [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY",
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff",
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin",
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains",
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), geolocation=(), microphone=(self)",
        },
      ]
    `);
  });

  it("dev adds only what React Refresh / HMR need", () => {
    const csp = securityHeaders(true)[0].value;
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("next.config applies them to every path", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toEqual([
      {
        source: "/:path*",
        headers: securityHeaders(process.env.NODE_ENV !== "production"),
      },
    ]);
  });
});
