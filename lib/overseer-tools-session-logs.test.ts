/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

vi.mock("@/lib/session-reader", () => ({
  getSessionLogs: vi.fn(),
}));

import type { PrismaClient } from "@/app/generated/prisma/client";
import { sessionLogsTool } from "@/lib/overseer-tools-session-logs";
import type { ToolContext } from "@/lib/overseer-tools";
import { getSessionLogs } from "@/lib/session-reader";


let rig: DispatchRig | null = null;
let prisma: PrismaClient;
function ctx(): ToolContext {
  return { prisma };
}

beforeAll(async () => {
  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
});

beforeEach(async () => {
  await prisma.project.deleteMany({});
  vi.clearAllMocks();
});

describe("sessionLogsTool", () => {
  it("returns {found:false, logs:[]} for unknown slug", async () => {
    const out = await sessionLogsTool.handler({ slug: "nope" }, ctx());
    expect(out).toEqual({ found: false, slug: "nope", logs: [] });
    expect(getSessionLogs).not.toHaveBeenCalled();
  });

  it("returns logs from session-reader for known slug", async () => {
    await prisma.project.create({
      data: { name: "X", slug: "x", path: "/tmp/x" },
    });
    vi.mocked(getSessionLogs).mockResolvedValueOnce([
      {
        filename: "2026-04-27T09-15-00.md",
        timestamp: "2026-04-27T09:15:00",
        content: "...full content...",
        summary: "phase 11 done",
      },
    ]);

    const out = await sessionLogsTool.handler({ slug: "x" }, ctx());
    expect(out.found).toBe(true);
    expect(out.logs.length).toBe(1);
    expect(out.logs[0].filename).toBe("2026-04-27T09-15-00.md");
    expect(out.logs[0].summary).toBe("phase 11 done");
    expect(getSessionLogs).toHaveBeenCalledWith("/tmp/x", 1);
  });

  it("respects limit", async () => {
    await prisma.project.create({
      data: { name: "X", slug: "x", path: "/tmp/x" },
    });
    vi.mocked(getSessionLogs).mockResolvedValueOnce([]);
    await sessionLogsTool.handler({ slug: "x", limit: 5 }, ctx());
    expect(getSessionLogs).toHaveBeenCalledWith("/tmp/x", 5);
  });

  it("treats reader errors as empty result (not a tool failure)", async () => {
    await prisma.project.create({
      data: { name: "X", slug: "x", path: "/tmp/x" },
    });
    vi.mocked(getSessionLogs).mockRejectedValueOnce(new Error("ENOENT"));
    const out = await sessionLogsTool.handler({ slug: "x" }, ctx());
    expect(out).toEqual({ found: true, slug: "x", logs: [] });
  });
});
