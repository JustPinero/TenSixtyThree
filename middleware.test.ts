/**
 * Edge middleware: edge-secret gate + canonical x-client-ip injection.
 * Pure decisions live in lib/client-ip.ts / lib/route-guard.ts; this
 * checks the wiring with real NextRequest objects.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const SECRET = "edge-secret-for-tests";
const saved = { ...process.env };

beforeEach(() => {
  process.env.AUTH_REQUIRED = "false";
});
afterEach(() => {
  process.env = { ...saved };
});

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://www.tensixtythree.com${path}`, { headers });
}

describe("middleware — edge gate", () => {
  it("403s direct-to-origin requests when EDGE_SHARED_SECRET is set", async () => {
    process.env.EDGE_SHARED_SECRET = SECRET;
    const res = await middleware(req("/api/projects"));
    expect(res.status).toBe(403);
  });

  it("lets the healthcheck through without the secret", async () => {
    process.env.EDGE_SHARED_SECRET = SECRET;
    const res = await middleware(req("/api/health"));
    expect(res.status).toBe(200);
  });

  it("passes when the Worker presents the secret", async () => {
    process.env.EDGE_SHARED_SECRET = SECRET;
    const res = await middleware(req("/api/projects", { "x-edge-secret": SECRET }));
    expect(res.status).toBe(200);
  });

  it("is a no-op gate when the secret is unset", async () => {
    delete process.env.EDGE_SHARED_SECRET;
    const res = await middleware(req("/api/projects"));
    expect(res.status).toBe(200);
  });
});

describe("middleware — x-client-ip injection", () => {
  it("forwards cf-connecting-ip as x-client-ip when the edge is verified", async () => {
    process.env.EDGE_SHARED_SECRET = SECRET;
    const res = await middleware(
      req("/api/projects", {
        "x-edge-secret": SECRET,
        "cf-connecting-ip": "198.51.100.7",
        "x-forwarded-for": "198.51.100.7, 172.71.0.1",
      }),
    );
    expect(res.headers.get("x-middleware-request-x-client-ip")).toBe("198.51.100.7");
  });

  it("overwrites a client-supplied x-client-ip with the last proxy hop when unverified", async () => {
    delete process.env.EDGE_SHARED_SECRET;
    const res = await middleware(
      req("/api/projects", { "x-client-ip": "6.6.6.6", "x-forwarded-for": "1.1.1.1, 203.0.113.9" }),
    );
    expect(res.headers.get("x-middleware-request-x-client-ip")).toBe("203.0.113.9");
  });
});
