/**
 * Phase 65.1/65.2 — the privileged runner never executes anything the
 * agent planted, and credentials never ride in a URL or argv.
 *
 * Real git against temp repos: a bare "origin", a pristine clone the
 * runner owns, an agent working copy the agent controls. The agent's
 * working copy is booby-trapped with hooks, fsmonitor, a url rewrite and
 * a proxy; publishing must not trip any of them.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  gitAuthEnv,
  pristineClone,
  agentWorktree,
  exportAgentWork,
  publishBundle,
} from "./git-ops";

let root: string;
let origin: string;
let sentinel: string;

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
  }).toString();
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "gitops-"));
  sentinel = path.join(root, "PWNED");
  // a bare origin with one commit on main
  const seed = path.join(root, "seed");
  fs.mkdirSync(seed);
  git(seed, "init", "-b", "main");
  fs.writeFileSync(path.join(seed, "README.md"), "# hi\n");
  git(seed, "add", "-A");
  git(
    seed,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-m",
    "init",
  );
  origin = path.join(root, "origin.git");
  git(root, "clone", "--bare", seed, origin);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function booby(workdir: string) {
  const hooks = path.join(workdir, ".git", "hooks");
  for (const h of [
    "pre-commit",
    "pre-push",
    "post-checkout",
    "reference-transaction",
  ]) {
    fs.writeFileSync(path.join(hooks, h), `#!/bin/sh\ntouch ${sentinel}\n`, {
      mode: 0o755,
    });
  }
  const fsmon = path.join(root, "fsmon.sh");
  fs.writeFileSync(fsmon, `#!/bin/sh\ntouch ${sentinel}\n`, { mode: 0o755 });
  git(workdir, "config", "core.fsmonitor", fsmon);
  git(
    workdir,
    "config",
    `url.file://${root}/evil.git.insteadOf`,
    `file://${origin}`,
  );
  git(workdir, "config", "http.proxy", "http://127.0.0.1:9");
}

describe("gitAuthEnv", () => {
  it("passes the token as an http.extraHeader through env, never argv/URL", () => {
    const env = gitAuthEnv("ghp_secret_token_value_123456");
    expect(env.GIT_CONFIG_COUNT).toBe("1");
    expect(env.GIT_CONFIG_KEY_0).toBe("http.https://github.com/.extraheader");
    expect(env.GIT_CONFIG_VALUE_0).toMatch(/^AUTHORIZATION: basic /);
    expect(env.GIT_CONFIG_VALUE_0).not.toContain(
      "ghp_secret_token_value_123456",
    );
    expect(gitAuthEnv(null)).toEqual({});
  });
});

describe("pristine clone → agent worktree → bundle → publish", () => {
  it("publishes the agent's commits without running anything the agent planted", async () => {
    const jobDir = fs.mkdtempSync(path.join(root, "job-"));
    const { pristine, base } = await pristineClone({
      url: `file://${origin}`,
      token: null,
      dir: path.join(jobDir, "pristine"),
    });
    const workdir = path.join(jobDir, "work");
    await agentWorktree({
      pristine,
      workdir,
      publicUrl: "https://github.com/o/r.git",
    });
    expect(git(workdir, "remote", "get-url", "origin").trim()).toBe(
      "https://github.com/o/r.git",
    );

    // the "agent" does work, leaves one change uncommitted, and plants traps
    fs.writeFileSync(path.join(workdir, "feature.ts"), "export const x = 1;\n");
    git(workdir, "add", "-A");
    git(
      workdir,
      "-c",
      "user.name=a",
      "-c",
      "user.email=a@a",
      "commit",
      "-m",
      "agent work",
    );
    fs.writeFileSync(
      path.join(workdir, "left-over.ts"),
      "export const y = 2;\n",
    );
    booby(workdir);

    const outDir = path.join(jobDir, "out");
    fs.mkdirSync(outDir);
    const exported = await exportAgentWork({
      workdir,
      base,
      outDir,
      runAs: null,
      dispatchId: "d1",
    });
    expect(exported.bundle).not.toBeNull();

    const published = await publishBundle({
      pristine,
      bundle: exported.bundle!,
      base,
      branch: "cloud/d1",
      remoteUrl: `file://${origin}`,
      token: null,
      allowWorkflowChanges: false,
    });
    expect(published).toEqual({ pushed: true, branch: "cloud/d1" });
    expect(fs.existsSync(sentinel)).toBe(false);
    const files = git(origin, "ls-tree", "-r", "--name-only", "cloud/d1");
    expect(files).toContain("feature.ts");
    expect(files).toContain("left-over.ts");
  });

  it("no new commits → nothing exported", async () => {
    const jobDir = fs.mkdtempSync(path.join(root, "job-"));
    const { pristine, base } = await pristineClone({
      url: `file://${origin}`,
      token: null,
      dir: path.join(jobDir, "pristine"),
    });
    const workdir = path.join(jobDir, "work");
    await agentWorktree({
      pristine,
      workdir,
      publicUrl: "https://github.com/o/r.git",
    });
    const outDir = path.join(jobDir, "out");
    fs.mkdirSync(outDir);
    const exported = await exportAgentWork({
      workdir,
      base,
      outDir,
      runAs: null,
      dispatchId: "d2",
    });
    expect(exported.bundle).toBeNull();
  });

  it("refuses to push changes under .github/workflows/", async () => {
    const jobDir = fs.mkdtempSync(path.join(root, "job-"));
    const { pristine, base } = await pristineClone({
      url: `file://${origin}`,
      token: null,
      dir: path.join(jobDir, "pristine"),
    });
    const workdir = path.join(jobDir, "work");
    await agentWorktree({
      pristine,
      workdir,
      publicUrl: "https://github.com/o/r.git",
    });
    fs.mkdirSync(path.join(workdir, ".github", "workflows"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workdir, ".github", "workflows", "x.yml"),
      "on: push\n",
    );
    const outDir = path.join(jobDir, "out");
    fs.mkdirSync(outDir);
    const exported = await exportAgentWork({
      workdir,
      base,
      outDir,
      runAs: null,
      dispatchId: "d3",
    });
    const published = await publishBundle({
      pristine,
      bundle: exported.bundle!,
      base,
      branch: "cloud/d3",
      remoteUrl: `file://${origin}`,
      token: null,
      allowWorkflowChanges: false,
    });
    expect(published.pushed).toBe(false);
    expect(published.reason).toMatch(/workflow/i);
    expect(git(origin, "branch", "--list", "cloud/d3").trim()).toBe("");
  });

  it("a bundle path that is a symlink is refused", async () => {
    const jobDir = fs.mkdtempSync(path.join(root, "job-"));
    const { pristine, base } = await pristineClone({
      url: `file://${origin}`,
      token: null,
      dir: path.join(jobDir, "pristine"),
    });
    const link = path.join(jobDir, "evil.bundle");
    fs.symlinkSync("/etc/hosts", link);
    await expect(
      publishBundle({
        pristine,
        bundle: link,
        base,
        branch: "cloud/d4",
        remoteUrl: `file://${origin}`,
        token: null,
        allowWorkflowChanges: false,
      }),
    ).rejects.toThrow(/regular file/);
  });
});
