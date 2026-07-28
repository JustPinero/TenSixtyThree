/**
 * Phase 48.4 — brain registry: repos designated as knowledge/persona stores.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { validateBrainPath, resolveBrainPath } from "./brain-registry";

let rig: DispatchRig | null = null;
let scratch: string | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
  delete process.env.KILROY_BRAIN_PATH;
});

function makeGitDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "brain-"));
  mkdirSync(join(dir, ".git"));
  return dir;
}

describe("brain registry", () => {
  it("validateBrainPath accepts a git repo and rejects a plain dir", () => {
    scratch = makeGitDir();
    expect(validateBrainPath(scratch).ok).toBe(true);
    const plain = mkdtempSync(join(tmpdir(), "plain-"));
    try {
      expect(validateBrainPath(plain).ok).toBe(false);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
    expect(validateBrainPath("/definitely/not/here").ok).toBe(false);
  });

  it("resolveBrainPath prefers the registered brain over env", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    scratch = makeGitDir();
    process.env.KILROY_BRAIN_PATH = "/env/brain";
    await rig.prisma.brain.create({ data: { name: "kilroy", path: scratch } });
    expect(await resolveBrainPath(rig.prisma)).toBe(scratch);
  });

  it("falls back to KILROY_BRAIN_PATH env, then null", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    process.env.KILROY_BRAIN_PATH = "/env/brain";
    expect(await resolveBrainPath(rig.prisma)).toBe("/env/brain");
    delete process.env.KILROY_BRAIN_PATH;
    expect(await resolveBrainPath(rig.prisma)).toBeNull();
  });
});
