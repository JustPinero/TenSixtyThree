/**
 * [41.D7] — direct contract test for the shared ingestion path (previously
 * exercised only via the HTTP route + drain tests).
 */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { ingestSessionComplete } from "./webhook-ingest";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

describe("ingestSessionComplete contract", () => {
  it("rejects an out-of-tree projectPath before any DB work", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const result = await ingestSessionComplete(rig.prisma as never, {
      projectPath: "/etc/passwd",
    });
    expect(result.ok).toBe(false);
    expect(result.rejected).toBe(true);
  });

  it("accepts an in-tree path and resolves the project slug", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await rig.createProject({ slug: "alpha", path: "/p/alpha" });
    const result = await ingestSessionComplete(rig.prisma as never, {
      projectPath: "/p/alpha",
    });
    expect(result.ok).toBe(true);
    expect(result.slug).toBe("alpha");
  });
});
