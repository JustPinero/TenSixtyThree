import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { generateAdvisories } from "./advisory-engine";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

const TEST_DIR = path.resolve(__dirname, "../.test-advisory");

let prisma: PrismaClient;
let rig: DispatchRig | null = null;

beforeAll(async () => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;

  // Create project with issues
  const projPath = path.join(TEST_DIR, "issue-project");
  fs.mkdirSync(projPath, { recursive: true });

  await prisma.project.create({
    data: {
      name: "Issue Project",
      slug: "issue-project",
      path: projPath,
      health: "warning",
      healthDetails: JSON.stringify({
        debtItems: ["SQLite database connection pool timeout", "Prisma query slow"],
      }),
    },
  });

  // Create matching knowledge lesson
  await prisma.knowledgeLesson.create({
    data: {
      title: "Use WAL mode for SQLite",
      content: "Enable WAL journal mode for concurrent database reads with Prisma. Fixes connection pool issues.",
      category: "database",
      severity: "critical",
      tags: JSON.stringify(["sqlite", "prisma", "database"]),
    },
  });

  // Create project with no issues
  const cleanPath = path.join(TEST_DIR, "clean-project");
  fs.mkdirSync(cleanPath, { recursive: true });

  await prisma.project.create({
    data: {
      name: "Clean Project",
      slug: "clean-project",
      path: cleanPath,
      health: "healthy",
    },
  });
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("advisory-engine", () => {
  it("generates advisory for project with matching issues", async () => {
    const result = await generateAdvisories(prisma);
    expect(result.advisoriesWritten).toBeGreaterThanOrEqual(1);
    expect(result.advisories.some((a) => a.project === "Issue Project")).toBe(true);
  });

  it("writes advisory file to project directory", async () => {
    const advisoryPath = path.join(
      TEST_DIR,
      "issue-project",
      ".claude",
      "nerve-center-advisory.md"
    );
    const exists = fs.existsSync(advisoryPath);
    expect(exists).toBe(true);

    const content = await fsp.readFile(advisoryPath, "utf-8");
    expect(content).toContain("Nerve Center Advisory");
    expect(content).toContain("WAL mode");
  });

  it("does not write advisory for clean project", () => {
    const advisoryPath = path.join(
      TEST_DIR,
      "clean-project",
      ".claude",
      "nerve-center-advisory.md"
    );
    expect(fs.existsSync(advisoryPath)).toBe(false);
  });

  it("logs activity event for advisory", async () => {
    const events = await prisma.activityEvent.findMany({
      where: { eventType: "advisory-sent" },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });
});
