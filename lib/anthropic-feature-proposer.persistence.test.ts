/**
 * [1.0.D1] migrated off the SQLite compat alias to the worker-scoped rig.
 * The alias path spawned two `execSync` psql processes per file; the rig
 * clones the template over an in-process pg connection instead.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import type { PrismaClient } from "@/app/generated/prisma/client";
import path from "path";
import fsp from "fs/promises";
import os from "os";
import { proposeForProject } from "@/lib/anthropic-feature-proposer";


let rig: DispatchRig | null = null;
let prisma: PrismaClient;
let projectId: number;
let featureId: number;
let tmpRoot: string;

beforeAll(async () => {
  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;

  const feature = await prisma.upstreamFeature.create({
    data: {
      vendor: "anthropic",
      name: "Stop Hook",
      category: "hook",
      description: "Fires on session end.",
      integrationRecipe: "Add hooks.Stop to .claude/settings.json.",
      detector: "detectsStopHook",
    },
  });
  featureId = feature.id;

  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "cascade-persist-"));
  const projectPath = path.join(tmpRoot, "project");
  await fsp.mkdir(path.join(projectPath, ".claude"), { recursive: true });
  await fsp.writeFile(path.join(projectPath, "CLAUDE.md"), "# x");
  await fsp.writeFile(
    path.join(projectPath, ".claude", "settings.json"),
    JSON.stringify({ hooks: {} }),
  );
  const project = await prisma.project.create({
    data: { name: "demo", slug: "demo", path: projectPath },
  });
  projectId = project.id;
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

describe("proposeForProject persistence (phase 11.3)", () => {
  it("persists each successful proposal as a FeatureProposal row by default", async () => {
    const before = await prisma.featureProposal.count();
    const result = await proposeForProject(prisma, projectId, {
      maxFeatures: 1,
      deps: { callClaude: async () => "MOCK_DIFF" },
    });
    const after = await prisma.featureProposal.count();
    expect(after - before).toBe(1);
    expect(result.proposals[0].proposalId).toBeTypeOf("number");

    const row = await prisma.featureProposal.findUnique({
      where: { id: result.proposals[0].proposalId! },
    });
    expect(row?.status).toBe("proposed");
    expect(row?.diff).toBe("MOCK_DIFF");
    expect(row?.projectId).toBe(projectId);
    expect(row?.featureId).toBe(featureId);
  });

  it("does NOT persist when persist:false (test mode)", async () => {
    const before = await prisma.featureProposal.count();
    const result = await proposeForProject(prisma, projectId, {
      maxFeatures: 1,
      persist: false,
      deps: { callClaude: async () => "MOCK_DIFF" },
    });
    const after = await prisma.featureProposal.count();
    expect(after).toBe(before);
    expect(result.proposals[0].proposalId).toBeUndefined();
  });

  it("captures Claude errors with proposalId:null (no row written)", async () => {
    const before = await prisma.featureProposal.count();
    const result = await proposeForProject(prisma, projectId, {
      maxFeatures: 1,
      deps: {
        callClaude: async () => {
          throw new Error("rate limited");
        },
      },
    });
    const after = await prisma.featureProposal.count();
    expect(after).toBe(before);
    expect(result.proposals[0].error).toContain("rate limited");
    expect(result.proposals[0].proposalId).toBeNull();
  });
});
