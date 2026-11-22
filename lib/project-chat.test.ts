import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { buildProjectSystemPrompt } from "./project-chat";
import fs from "fs";
import path from "path";

const TEST_DIR = path.resolve(__dirname, "../.test-chat");

let prisma: PrismaClient;
let rig: DispatchRig | null = null;

beforeAll(async () => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });

  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;

  // Create project directory with context files
  fs.mkdirSync(path.join(TEST_DIR, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, "audits"), { recursive: true });
  fs.writeFileSync(path.join(TEST_DIR, "CLAUDE.md"), "# Test Project\nUse TypeScript strict.");
  fs.writeFileSync(path.join(TEST_DIR, ".claude", "handoff.md"), "Last session: fixed auth bug.");
  fs.writeFileSync(path.join(TEST_DIR, "audits", "debt.md"), "## Open\n- Fix login timeout\n## Resolved\n");

  await prisma.knowledgeLesson.create({
    data: { title: "Always validate inputs", content: "Validate all API inputs", category: "testing", severity: "critical", tags: "[]" },
  });
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("buildProjectSystemPrompt", () => {
  it("includes project CLAUDE.md content", async () => {
    const prompt = await buildProjectSystemPrompt(prisma, TEST_DIR, "Test Project", {});
    expect(prompt).toContain("TypeScript strict");
  });

  it("includes handoff content", async () => {
    const prompt = await buildProjectSystemPrompt(prisma, TEST_DIR, "Test Project", {});
    expect(prompt).toContain("fixed auth bug");
  });

  it("includes debt log", async () => {
    const prompt = await buildProjectSystemPrompt(prisma, TEST_DIR, "Test Project", {});
    expect(prompt).toContain("Fix login timeout");
  });

  it("includes knowledge lessons", async () => {
    const prompt = await buildProjectSystemPrompt(prisma, TEST_DIR, "Test Project", {});
    expect(prompt).toContain("Always validate inputs");
  });

  it("includes project name", async () => {
    const prompt = await buildProjectSystemPrompt(prisma, TEST_DIR, "Test Project", {});
    expect(prompt).toContain("Test Project");
  });

  it("handles missing files gracefully", async () => {
    const emptyDir = path.join(TEST_DIR, "empty");
    fs.mkdirSync(emptyDir, { recursive: true });
    const prompt = await buildProjectSystemPrompt(prisma, emptyDir, "Empty", {});
    expect(prompt).toContain("No CLAUDE.md found");
  });
});
