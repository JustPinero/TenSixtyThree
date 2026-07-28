/**
 * Phase 47.1 — AI service/model settings API.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.resetModules();
});

async function loadRoute(rigInstance: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: rigInstance.prisma }));
  return await import("./route");
}

describe("/api/settings/model", () => {
  it("GET returns current resolution + options", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { GET } = await loadRoute(rig);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.model).toBe("claude-sonnet-5");
    expect(body.service).toBe("claude");
    expect(body.options.length).toBeGreaterThanOrEqual(3);
  });

  it("PATCH persists a valid model override", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { PATCH, GET } = await loadRoute(rig);
    const res = await PATCH(
      new Request("http://x/api/settings/model", {
        method: "PATCH",
        body: JSON.stringify({ model: "claude-opus-4-8" }),
      }),
    );
    expect(res.status).toBe(200);
    const after = await (await GET()).json();
    expect(after.model).toBe("claude-opus-4-8");
  });

  it("PATCH rejects an unknown model", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { PATCH } = await loadRoute(rig);
    const res = await PATCH(
      new Request("http://x/api/settings/model", {
        method: "PATCH",
        body: JSON.stringify({ model: "gpt-9000" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
