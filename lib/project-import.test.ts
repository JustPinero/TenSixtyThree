import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { importProjects } from "./project-import";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";

const TEST_PROJECTS_DIR = path.resolve(__dirname, "../.test-import-projects");

let prisma: PrismaClient;
let rig: DispatchRig | null = null;

beforeAll(async () => {
  await fs.rm(TEST_PROJECTS_DIR, { recursive: true, force: true });

  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;

  // Create test project directories
  await fs.mkdir(TEST_PROJECTS_DIR, { recursive: true });

  // Project with full structure
  const projA = path.join(TEST_PROJECTS_DIR, "Alpha-App");
  await fs.mkdir(projA, { recursive: true });
  await fs.mkdir(path.join(projA, "audits"), { recursive: true });
  await fs.mkdir(path.join(projA, "requests"), { recursive: true });
  await fs.writeFile(path.join(projA, "CLAUDE.md"), "# Alpha");
  execSync("git init && git add -A && git -c user.name=Cascade -c user.email=test@local.dev commit --allow-empty -m init", {
    cwd: projA,
    stdio: "pipe",
  });

  // Minimal project (no CLAUDE.md, no git)
  const projB = path.join(TEST_PROJECTS_DIR, "Beta-Tool");
  await fs.mkdir(projB, { recursive: true });
  await fs.writeFile(path.join(projB, "README.md"), "# Beta");
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
  await fs.rm(TEST_PROJECTS_DIR, { recursive: true, force: true });
});

describe("importProjects", () => {
  it("creates new project records", async () => {
    const result = await importProjects(prisma, TEST_PROJECTS_DIR);

    expect(result.total).toBe(2);
    expect(result.created).toBe(2);
    expect(result.updated).toBe(0);

    const projects = await prisma.project.findMany();
    expect(projects).toHaveLength(2);
  });

  it("sets correct health based on project structure", async () => {
    const alpha = await prisma.project.findUnique({
      where: { slug: "alpha-app" },
    });
    const beta = await prisma.project.findUnique({
      where: { slug: "beta-tool" },
    });

    // Alpha has git + CLAUDE.md → healthy
    expect(alpha!.health).toBe("healthy");
    // Beta has no git → idle
    expect(beta!.health).toBe("idle");
  });

  it("stores health details as JSON", async () => {
    const alpha = await prisma.project.findUnique({
      where: { slug: "alpha-app" },
    });
    const details = JSON.parse(alpha!.healthDetails);
    expect(details.hasClaude).toBe(true);
    expect(details.hasGit).toBe(true);
    expect(details.hasAudits).toBe(true);
    expect(details.hasRequests).toBe(true);
  });

  it("is idempotent — running twice doesn't duplicate", async () => {
    const result = await importProjects(prisma, TEST_PROJECTS_DIR);

    expect(result.total).toBe(2);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(2);

    const projects = await prisma.project.findMany();
    expect(projects).toHaveLength(2);
  });

  it("updates existing projects on re-scan", async () => {
    const before = await prisma.project.findUnique({
      where: { slug: "alpha-app" },
    });
    const beforeScanned = before!.lastScannedAt;

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));

    await importProjects(prisma, TEST_PROJECTS_DIR);

    const after = await prisma.project.findUnique({
      where: { slug: "alpha-app" },
    });
    expect(after!.lastScannedAt.getTime()).toBeGreaterThan(
      beforeScanned.getTime()
    );
  });

  it("handles missing directory gracefully", async () => {
    const result = await importProjects(prisma, "/nonexistent/path");
    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
  });

  it("handles projects with no CLAUDE.md", async () => {
    const beta = await prisma.project.findUnique({
      where: { slug: "beta-tool" },
    });
    expect(beta).not.toBeNull();
    expect(beta!.name).toBe("Beta-Tool");

    const details = JSON.parse(beta!.healthDetails);
    expect(details.hasClaude).toBe(false);
  });
});
