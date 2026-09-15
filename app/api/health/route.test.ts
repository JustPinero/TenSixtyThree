/** 1.0 — the Railway healthcheck target, asserted at the route level. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
  vi.unstubAllEnvs();
});

async function load(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return await import("./route");
}

const HOSTED_ENV = {
  DATABASE_URL: "x", ANTHROPIC_API_KEY: "x", BETTER_AUTH_SECRET: "x",
  BETTER_AUTH_URL: "x", AUTH_REQUIRED: "true", ENCRYPTION_KEY: "x",
  ADMIN_EMAILS: "x", GITHUB_CLIENT_ID: "x", GITHUB_CLIENT_SECRET: "x",
};

describe("GET /api/health", () => {
  it("200 ok with db up when hosted env is complete", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    for (const [k, v] of Object.entries(HOSTED_ENV)) vi.stubEnv(k, v);
    const route = await load(rig);
    const res = await route.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe("up");
    expect(body.missingEnv).toEqual([]);
  });

  it("stays 200 but self-diagnoses missing hosted env (must answer even when misconfigured)", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    for (const [k, v] of Object.entries(HOSTED_ENV)) vi.stubEnv(k, v);
    vi.stubEnv("ADMIN_EMAILS", "");
    const route = await load(rig);
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).missingEnv).toContain("ADMIN_EMAILS");
  });
});
