/** Phase 48.4 — /api/brains registry surface. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

let rig: DispatchRig | null = null;
let scratch: string | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
  vi.resetModules();
});

async function loadRoute(r: DispatchRig) {
  vi.doMock("@/lib/db", () => ({ prisma: r.prisma }));
  return await import("./route");
}

describe("/api/brains", () => {
  it("POST registers a valid git repo; GET lists it with validity", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    scratch = mkdtempSync(join(tmpdir(), "brain-"));
    mkdirSync(join(scratch, ".git"));
    const route = await loadRoute(rig);
    const res = await route.POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ name: "kilroy-brain", path: scratch }),
      }),
    );
    expect(res.status).toBe(200);
    const list = await (await route.GET()).json();
    expect(list.brains.length).toBe(1);
    expect(list.brains[0].valid).toBe(true);
  });

  it("POST rejects a non-repo path", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const route = await loadRoute(rig);
    const res = await route.POST(
      new Request("http://x", {
        method: "POST",
        body: JSON.stringify({ name: "bad", path: "/nope/nope" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
