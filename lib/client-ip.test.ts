/**
 * Proxy-aware client IP + edge trust. Behind Cloudflare (Worker) → Railway
 * the LAST x-forwarded-for hop is Cloudflare's egress, so every visitor
 * would share one rate-limit bucket. The Worker proves itself with a
 * shared secret; only then is cf-connecting-ip trusted.
 */
import { describe, expect, it } from "vitest";
import {
  CLIENT_IP_HEADER,
  EDGE_SECRET_HEADER,
  edgeGate,
  resolveClientIp,
} from "./client-ip";

const SECRET = "s3cr3t-value-with-enough-entropy";

function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("resolveClientIp", () => {
  it("trusts cf-connecting-ip when the edge secret matches", () => {
    const r = resolveClientIp(
      h({ [EDGE_SECRET_HEADER]: SECRET, "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "198.51.100.7, 172.71.0.1" }),
      SECRET,
    );
    expect(r).toEqual({ ip: "198.51.100.7", source: "edge" });
  });

  it("falls back to the last x-forwarded-for hop when the secret is wrong", () => {
    const r = resolveClientIp(
      h({ [EDGE_SECRET_HEADER]: "nope", "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "1.1.1.1, 203.0.113.9" }),
      SECRET,
    );
    expect(r).toEqual({ ip: "203.0.113.9", source: "proxy" });
  });

  it("ignores cf-connecting-ip entirely when no secret is configured (forgeable)", () => {
    const r = resolveClientIp(
      h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9" }),
      undefined,
    );
    expect(r).toEqual({ ip: "203.0.113.9", source: "proxy" });
  });

  it("ignores cf-connecting-ip when the secret header is absent", () => {
    const r = resolveClientIp(
      h({ "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9" }),
      SECRET,
    );
    expect(r.ip).toBe("203.0.113.9");
  });

  it("yields 'local' with no proxy headers at all", () => {
    expect(resolveClientIp(h({}), SECRET)).toEqual({ ip: "local", source: "none" });
  });

  it("never trusts a client-supplied x-client-ip header", () => {
    const r = resolveClientIp(h({ [CLIENT_IP_HEADER]: "6.6.6.6", "x-forwarded-for": "203.0.113.9" }), SECRET);
    expect(r.ip).toBe("203.0.113.9");
  });

  it("does not match a secret prefix (length-sensitive compare)", () => {
    const r = resolveClientIp(
      h({ [EDGE_SECRET_HEADER]: SECRET.slice(0, -1), "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "203.0.113.9" }),
      SECRET,
    );
    expect(r.source).toBe("proxy");
  });
});

describe("edgeGate — origin-bypass protection", () => {
  it("allows everything when no secret is configured (local / pre-rollout)", () => {
    expect(edgeGate({ path: "/api/projects", configuredSecret: undefined, presentedSecret: null })).toBe("allow");
  });

  it("allows when the presented secret matches", () => {
    expect(edgeGate({ path: "/api/projects", configuredSecret: SECRET, presentedSecret: SECRET })).toBe("allow");
  });

  it("rejects when the secret is configured but absent or wrong", () => {
    expect(edgeGate({ path: "/api/projects", configuredSecret: SECRET, presentedSecret: null })).toBe("reject");
    expect(edgeGate({ path: "/signin", configuredSecret: SECRET, presentedSecret: "wrong" })).toBe("reject");
  });

  it("always allows the Railway healthcheck path (it hits the origin directly)", () => {
    expect(edgeGate({ path: "/api/health", configuredSecret: SECRET, presentedSecret: null })).toBe("allow");
  });

  it("treats an empty configured secret as unset", () => {
    expect(edgeGate({ path: "/api/projects", configuredSecret: "", presentedSecret: null })).toBe("allow");
  });
});
