/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { launchProject } from "./project-launcher";
import fs from "fs";
import path from "path";

const TEST_DIR = path.resolve(__dirname, "../.test-launcher");

let rig: DispatchRig | null = null;
let prisma: PrismaClient;

beforeAll(async () => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;

});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("launchProject", () => {
  it("creates project directory with kickoff file", async () => {
    const result = await launchProject(prisma, TEST_DIR, {
      name: "Test Launch",
      slug: "test-launch",
      projectType: "web-app",
      kickoffContent: "# Test Project\n\nKickoff content here.",
      createGithubRepo: false,
      isPrivate: true,
      autonomyMode: "semi",
      agentTeamsEnabled: false,
      prWorkflowEnabled: false,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(result.projectPath)).toBe(true);
    expect(
      fs.existsSync(path.join(result.projectPath, "KICKOFF.md"))
    ).toBe(true);
  });

  it("initializes git in the project", () => {
    const projectPath = path.join(TEST_DIR, "Test Launch");
    expect(fs.existsSync(path.join(projectPath, ".git"))).toBe(true);
  });

  it("writes kickoff content correctly", () => {
    const projectPath = path.join(TEST_DIR, "Test Launch");
    const content = fs.readFileSync(
      path.join(projectPath, "KICKOFF.md"),
      "utf-8"
    );
    expect(content).toContain("# Test Project");
  });

  it("registers project in database", async () => {
    const project = await prisma.project.findUnique({
      where: { slug: "test-launch" },
    });
    expect(project).not.toBeNull();
    expect(project!.name).toBe("Test Launch");
    expect(project!.autonomyMode).toBe("semi");
  });

  it("creates activity event", async () => {
    const events = await prisma.activityEvent.findMany({
      where: { eventType: "project-created" },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].summary).toContain("Test Launch");
  });

  it("does not create GitHub repo when disabled", async () => {
    const project = await prisma.project.findUnique({
      where: { slug: "test-launch" },
    });
    expect(project!.githubRepo).toBeNull();
  });
});
