/** 1.0 — public demo minter: seeds a sandbox, sets the session cookie, rate-limits. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { clearRateLimits } from "@/lib/rate-limiter";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
  clearRateLimits();
});

async function load(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return await import("./route");
}

function post(ip = "203.0.113.5") {
  return new NextRequest("http://x/api/demo", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

describe("POST /api/demo", () => {
  it("mints a demo user + org and sets the session cookie", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    const res = await route.POST(post());
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("better-auth.session_token=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(await rig.prisma.user.count({ where: { isDemo: true } })).toBe(1);
    expect(await rig.prisma.organization.count({ where: { isDemo: true } })).toBe(1);
  });

  it("rate-limits to 3/hour per client IP, keyed on the trusted last hop", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await load(rig);
    // Attacker-prepended junk must not mint fresh buckets — same real IP.
    for (const junk of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
      expect((await route.POST(post(`${junk}, 203.0.113.5`))).status).toBe(200);
    }
    expect((await route.POST(post("9.9.9.9, 203.0.113.5"))).status).toBe(429);
  });
});
