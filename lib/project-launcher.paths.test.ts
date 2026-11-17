/** 64.3 — launchProject never writes outside PROJECTS_DIR. */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { launchProject } from "./project-launcher";

const noDb = {} as PrismaClient;
const base = {
  slug: "ok",
  projectType: "web-app",
  kickoffContent: "x",
  createGithubRepo: false,
  isPrivate: true,
  autonomyMode: "semi",
  agentTeamsEnabled: false,
  prWorkflowEnabled: false,
};

describe("launchProject path containment", () => {
  for (const name of ["..", "../escape", "/tmp/abs-escape", "a/b"]) {
    it(`refuses name ${JSON.stringify(name)}`, async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-"));
      const res = await launchProject(noDb, dir, { ...base, name });
      expect(res.success).toBe(false);
      expect(fs.readdirSync(dir)).toEqual([]);
      expect(fs.existsSync(path.join(path.dirname(dir), "escape"))).toBe(false);
      fs.rmSync(dir, { recursive: true });
    });
  }

  it("refuses a dot-segment slug", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-"));
    const res = await launchProject(noDb, dir, { ...base, name: "Fine", slug: ".." });
    expect(res.success).toBe(false);
    fs.rmSync(dir, { recursive: true });
  });
});
