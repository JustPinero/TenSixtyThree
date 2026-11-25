/**
 * Phase 65.3/65.4 — one job leaves nothing for the next, and the app key
 * never reaches a non-admin's agent.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

const captured: { options: Record<string, unknown> }[] = [];
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { prompt: string; options: Record<string, unknown> }) => {
    captured.push({ options: args.options });
    return (async function* () {
      yield { type: "result", subtype: "success", total_cost_usd: 0.01, num_turns: 1 };
    })();
  },
}));

let rig: DispatchRig | null = null;
let root: string;
let origin: string;
const saved = { ...process.env };

function git(cwd: string, ...args: string[]) {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  });
}

beforeEach(() => {
  captured.length = 0;
  process.env.ANTHROPIC_API_KEY = "sk-ant-app-key-should-not-leak";
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  delete process.env.GITHUB_TOKEN;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "realdeps-"));
  const seed = path.join(root, "seed");
  fs.mkdirSync(seed);
  git(seed, "init", "-b", "main");
  fs.writeFileSync(path.join(seed, "a.txt"), "a\n");
  git(seed, "add", "-A");
  git(seed, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-m", "init");
  origin = path.join(root, "origin.git");
  git(root, "clone", "--bare", seed, origin);
});

afterEach(async () => {
  await rig?.dispose();
  rig = null;
  process.env = { ...saved };
  fs.rmSync(root, { recursive: true, force: true });
});

async function setup(role: "admin" | "user", byok: boolean) {
  rig = await createDispatchRig({ fakeTimers: false });
  const { seal } = await import("../crypto-box");
  await rig.prisma.user.create({
    data: {
      id: "u1",
      name: "u",
      email: "u@x.dev",
      role,
      anthropicKeyEnc: byok ? seal("sk-ant-user-own-key-0000000000") : null,
    },
  });
  const project = await rig.prisma.project.create({
    data: { name: "P", slug: "p", path: "/p/p", githubRepo: "o/r", ownerUserId: "u1" },
  });
  const dispatch = await rig.prisma.dispatch.create({
    data: {
      projectId: project.id,
      projectSlug: "p",
      mode: "continue",
      runtime: "cloud",
      ownerUserId: "u1",
    },
  });
  const { buildRealDeps } = await import("./real-deps");
  const deps = buildRealDeps(rig.prisma, {
    repoUrl: () => `file://${origin}`,
    agentUser: async () => null,
  });
  return { deps, dispatch };
}

async function drain(it: AsyncGenerator<unknown>) {
  for await (const _ of it) void _;
}

describe("per-job isolation (65.3)", () => {
  it("HOME/TMPDIR are per job and removed by cleanup; SDK gets settingSources [] + persistSession false", async () => {
    const { deps, dispatch } = await setup("user", true);
    const workdir = await deps.cloneRepo("o/r");
    await drain(deps.runAgent({ workdir, dispatch }));
    const opts = captured[0].options;
    expect(opts.settingSources).toEqual([]);
    expect(opts.persistSession).toBe(false);
    const env = opts.env as Record<string, string>;
    const jobDir = path.dirname(workdir);
    expect(env.HOME.startsWith(jobDir)).toBe(true);
    expect(env.TMPDIR.startsWith(jobDir)).toBe(true);
    expect(fs.existsSync(env.HOME)).toBe(true);
    await deps.cleanup(workdir);
    expect(fs.existsSync(jobDir)).toBe(false);
  });

  it("a failed clone leaves no temp dir behind", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const { buildRealDeps } = await import("./real-deps");
    const deps = buildRealDeps(rig.prisma, {
      repoUrl: () => `file://${root}/does-not-exist.git`,
      agentUser: async () => null,
    });
    const before = new Set(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("runner-")));
    await expect(deps.cloneRepo("o/r")).rejects.toThrow();
    const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("runner-"));
    expect(after.filter((n) => !before.has(n))).toEqual([]);
  });
});

describe("whose key pays (65.4)", () => {
  it("non-admin with BYOK: agent env carries the user's key, never the app key", async () => {
    const { deps, dispatch } = await setup("user", true);
    const workdir = await deps.cloneRepo("o/r");
    await drain(deps.runAgent({ workdir, dispatch }));
    const env = captured[0].options.env as Record<string, string>;
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-user-own-key-0000000000");
    expect(JSON.stringify(env)).not.toContain("sk-ant-app-key-should-not-leak");
    await deps.cleanup(workdir);
  });

  it("non-admin without BYOK: refused before any SDK call", async () => {
    const { deps, dispatch } = await setup("user", false);
    const workdir = await deps.cloneRepo("o/r");
    await expect(drain(deps.runAgent({ workdir, dispatch }))).rejects.toThrow(/own Anthropic key/);
    expect(captured).toHaveLength(0);
    await deps.cleanup(workdir);
  });

  it("broken stored key: hard error, no fallback", async () => {
    const { deps, dispatch } = await setup("admin", true);
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64"); // can't decrypt now
    const workdir = await deps.cloneRepo("o/r");
    await expect(drain(deps.runAgent({ workdir, dispatch }))).rejects.toThrow(/could not be decrypted/);
    expect(captured).toHaveLength(0);
    await deps.cleanup(workdir);
  });

  it("admin without BYOK may use the app key", async () => {
    const { deps, dispatch } = await setup("admin", false);
    const workdir = await deps.cloneRepo("o/r");
    await drain(deps.runAgent({ workdir, dispatch }));
    expect((captured[0].options.env as Record<string, string>).ANTHROPIC_API_KEY).toBe(
      "sk-ant-app-key-should-not-leak",
    );
    await deps.cleanup(workdir);
  });
});

describe("phase 74 — the app key never shares a uid with the agent", () => {
  it("refuses to run the agent same-uid while a GitHub App key is in the runner's env", async () => {
    const { deps, dispatch } = await setup("user", true);
    const workdir = await deps.cloneRepo("o/r");
    process.env.GITHUB_APP_ID = "1";
    process.env.GITHUB_APP_SLUG = "tensixtythree-runner";
    process.env.GITHUB_APP_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----";
    try {
      await expect(drain(deps.runAgent({ workdir, dispatch }))).rejects.toThrow(
        /separate agent user/i,
      );
      expect(captured).toHaveLength(0);
    } finally {
      delete process.env.GITHUB_APP_ID;
      delete process.env.GITHUB_APP_SLUG;
      delete process.env.GITHUB_APP_PRIVATE_KEY;
      await deps.cleanup(workdir);
    }
  });
});
