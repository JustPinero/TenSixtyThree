/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createHumanTodoTool } from "@/lib/overseer-tools-create-human-todo";
import { ToolRegistry, type ToolContext } from "@/lib/overseer-tools";


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
  await prisma.humanTask.deleteMany({});
  await prisma.project.deleteMany({});
});

describe("createHumanTodoTool", () => {
  it("creates a task with the supplied fields, defaults category=other and priority=normal", async () => {
    const out = await createHumanTodoTool.handler(
      { title: "Upload logo to /public/images" },
      ctx()
    );
    expect(out.id).toBeDefined();
    expect(out.title).toContain("Upload");
    expect(out.category).toBe("other");
    expect(out.priority).toBe("normal");
    const row = await prisma.humanTask.findUnique({ where: { id: out.id } });
    expect(row?.createdBy).toBe("delamain");
  });

  it("links to the project when slug resolves to a real row", async () => {
    const project = await prisma.project.create({
      data: { name: "X", slug: "x", path: "/tmp/x" },
    });
    const out = await createHumanTodoTool.handler(
      { title: "test stuff", projectSlug: "x", category: "testing", priority: "high" },
      ctx()
    );
    const row = await prisma.humanTask.findUnique({ where: { id: out.id } });
    expect(row?.projectId).toBe(project.id);
    expect(row?.category).toBe("testing");
    expect(row?.priority).toBe("high");
  });

  it("does not link to a project when slug does not resolve (still creates the task)", async () => {
    const out = await createHumanTodoTool.handler(
      { title: "yo", projectSlug: "missing-thing" },
      ctx()
    );
    const row = await prisma.humanTask.findUnique({ where: { id: out.id } });
    expect(row?.projectId).toBeNull();
    expect(row?.projectSlug).toBe("missing-thing");
  });

  it("rejects unknown category via the registry", async () => {
    const reg = new ToolRegistry();
    reg.register(createHumanTodoTool);
    const result = await reg.execute(
      "create_human_todo",
      { title: "x", category: "imaginary" },
      { prisma }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Unknown category/);
  });
});
