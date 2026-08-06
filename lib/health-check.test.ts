/**
 * Phase 51.4 — health check seam behind GET /api/health.
 * AC2 from requests/phase-51-hosted/51.4-railway-deploy.md.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { checkHealth, type HealthDb } from "./health-check";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

describe("AC2 — checkHealth", () => {
  it("reports ok/up against a live database", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const result = await checkHealth(rig.prisma, { DATABASE_URL: "set" });
    expect(result.status).toBe("ok");
    expect(result.db).toBe("up");
    expect(result.httpStatus).toBe(200);
  });

  it("reports degraded/down when the database does not answer", async () => {
    const dead: HealthDb = {
      $queryRaw: async () => {
        throw new Error("connection refused");
      },
    };
    const result = await checkHealth(dead, { DATABASE_URL: "set" });
    expect(result.status).toBe("degraded");
    expect(result.db).toBe("down");
    expect(result.httpStatus).toBe(503);
  });

  it("surfaces missing hosted env in the payload", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const result = await checkHealth(rig.prisma, {});
    expect(result.missingEnv).toContain("DATABASE_URL");
  });
});
