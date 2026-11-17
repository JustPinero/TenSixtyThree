/**
 * Phase 65.1/65.2 — git for the cloud runner, with a hard line between
 * what the privileged runner touches and what the agent controls.
 *
 *   pristine clone  (runner-owned, 0700, never seen by the agent)
 *        │  git clone --no-hardlinks
 *        ▼
 *   agent worktree  (chowned to the agent uid; the agent owns .git/config,
 *        │           hooks, attributes — everything)
 *        │  commit leftovers + `git bundle` — run AS THE AGENT UID
 *        ▼
 *   bundle file     (plain data; checked to be a regular file)
 *        │  fetch into the pristine clone, diff, push — runner uid, with a
 *        ▼  hardened env and the pristine clone's own config only
 *   remote branch
 *
 * The runner never runs git inside the agent's tree, so planted hooks,
 * core.fsmonitor, filter drivers, url rewrites and proxies never execute
 * with runner privileges or see the token. The token travels only as an
 * http.extraHeader in env (GIT_CONFIG_COUNT/KEY/VALUE), never in a URL,
 * argv, or .git/config.
 */
import { execFile } from "node:child_process";
import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { scrubSecrets } from "./scrub";

const execFileAsync = promisify(execFile);

export interface RunAs {
  uid: number;
  gid: number;
  home: string;
}

/** Config every runner-side git invocation carries. */
const HARDENED_ARGS = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "protocol.ext.allow=never",
  "-c",
  "credential.helper=",
];

/** Ignore user/system config; never prompt. */
function hardenedEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: "/nonexistent",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "/bin/false",
    ...extra,
  };
}

/** Token as an HTTP header, supplied through env only. */
export function gitAuthEnv(token: string | null): Record<string, string> {
  if (!token) return {};
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
}

async function runGit(
  args: string[],
  opts: {
    cwd?: string;
    env?: Record<string, string>;
    runAs?: RunAs | null;
    timeout?: number;
  },
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: opts.cwd,
      env: (opts.env ?? hardenedEnv()) as NodeJS.ProcessEnv,
      timeout: opts.timeout ?? 60_000,
      maxBuffer: 16 * 1024 * 1024,
      ...(opts.runAs ? { uid: opts.runAs.uid, gid: opts.runAs.gid } : {}),
    });
    return stdout;
  } catch (error) {
    // git echoes URLs and headers into stderr; never let them escape.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(scrubSecrets(message));
  }
}

/** Runner-owned shallow clone. Returns its path and the base commit. */
export async function pristineClone(args: {
  url: string;
  token: string | null;
  dir: string;
}): Promise<{ pristine: string; base: string }> {
  await mkdir(args.dir, { recursive: true, mode: 0o700 });
  await runGit(
    [...HARDENED_ARGS, "clone", "--depth", "1", args.url, args.dir],
    {
      env: hardenedEnv(gitAuthEnv(args.token)),
      timeout: 120_000,
    },
  );
  const base = (
    await runGit(["-C", args.dir, ...HARDENED_ARGS, "rev-parse", "HEAD"], {})
  ).trim();
  return { pristine: args.dir, base };
}

/** The agent's copy: separate objects (no hardlinks), public remote URL. */
export async function agentWorktree(args: {
  pristine: string;
  workdir: string;
  publicUrl: string;
}): Promise<void> {
  await runGit(
    [
      ...HARDENED_ARGS,
      "clone",
      "--no-hardlinks",
      "--quiet",
      args.pristine,
      args.workdir,
    ],
    {},
  );
  await runGit(
    [
      "-C",
      args.workdir,
      ...HARDENED_ARGS,
      "remote",
      "set-url",
      "origin",
      args.publicUrl,
    ],
    {},
  );
}

/**
 * Runs AS THE AGENT UID (runAs) with no secrets in env: commit anything
 * left uncommitted, then bundle base..HEAD into outDir. Whatever the
 * agent planted in its own repo can only act with the agent's own
 * privileges here.
 */
export async function exportAgentWork(args: {
  workdir: string;
  base: string;
  outDir: string;
  runAs: RunAs | null;
  dispatchId: string;
}): Promise<{ bundle: string | null }> {
  const env = hardenedEnv(args.runAs ? { HOME: args.runAs.home } : {});
  const G = [
    "-C",
    args.workdir,
    ...HARDENED_ARGS,
    "-c",
    `safe.directory=${args.workdir}`,
  ];
  const opts = { env, runAs: args.runAs };
  const status = await runGit([...G, "status", "--porcelain"], opts);
  if (status.trim()) {
    await runGit([...G, "add", "-A"], opts);
    await runGit(
      [
        ...G,
        "-c",
        "user.name=TenSixtyThree Runner",
        "-c",
        "user.email=runner@tensixtythree.com",
        "commit",
        "--no-verify",
        "-m",
        `cloud: session work (dispatch ${args.dispatchId})`,
      ],
      opts,
    );
  }
  const ahead = Number(
    (
      await runGit(
        [...G, "rev-list", "--count", `${args.base}..HEAD`],
        opts,
      ).catch(() => "0")
    ).trim(),
  );
  if (!Number.isFinite(ahead) || ahead === 0) return { bundle: null };
  const bundle = join(args.outDir, "work.bundle");
  await runGit([...G, "bundle", "create", bundle, `${args.base}..HEAD`], opts);
  return { bundle };
}

/** Files GitHub Actions executes. */
const CI_PATHS = [".github/workflows", ".github/actions"];

/**
 * Runner uid, pristine clone only: fetch the bundle (data), refuse
 * workflow edits unless allowed, push with the token in env.
 */
export async function publishBundle(args: {
  pristine: string;
  bundle: string;
  base: string;
  branch: string;
  remoteUrl: string;
  token: string | null;
  allowWorkflowChanges: boolean;
}): Promise<{ pushed: boolean; branch: string | null; reason?: string }> {
  const st = await lstat(args.bundle);
  if (!st.isFile()) throw new Error("bundle is not a regular file");
  const G = ["-C", args.pristine, ...HARDENED_ARGS];
  const ref = `refs/runner/${args.branch}`;
  await runGit([...G, "fetch", "--no-tags", args.bundle, `HEAD:${ref}`], {
    timeout: 120_000,
  });
  // NUL-separated, unquoted, rename-free, limited by pathspec: no path
  // quoting or rename trick can hide a CI file from this check.
  const ciChanges = (
    await runGit(
      [
        ...G,
        "-c",
        "core.quotePath=false",
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--name-only",
        "-z",
        args.base,
        ref,
        "--",
        ...CI_PATHS,
      ],
      {},
    )
  )
    .split("\0")
    .filter(Boolean);
  if (!args.allowWorkflowChanges && ciChanges.length > 0) {
    return {
      pushed: false,
      branch: null,
      reason:
        "Refused: the session changed CI files (.github/workflows/ or .github/actions/)",
    };
  }
  await runGit(
    [
      ...G,
      "push",
      "--no-verify",
      args.remoteUrl,
      `${ref}:refs/heads/${args.branch}`,
    ],
    {
      env: hardenedEnv(gitAuthEnv(args.token)),
      timeout: 120_000,
    },
  );
  return { pushed: true, branch: args.branch };
}
