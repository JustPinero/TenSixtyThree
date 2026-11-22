/**
 * 52.2 — production RunnerDeps: shallow git clone, Agent SDK stream,
 * scratch-dir cleanup. The SDK is imported dynamically so the Next.js
 * web build never bundles it — only scripts/runner.ts walks this path.
 *
 * Auth (65.4): the dispatch owner's BYOK key; admins may fall back to the
 * app key, nobody else does, and a stored key that fails to decrypt is a
 * hard error. GITHUB_TOKEN (optional) unlocks private-repo clones and
 * pushes — it reaches git only as an env-supplied http.extraHeader
 * (lib/runner/git-ops.ts), never a URL, argv, or the agent's env.
 */
import { mkdtemp, mkdir, rm, readFile, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { lstatSync, realpathSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { PrismaClient, Dispatch } from "@/app/generated/prisma/client";
import type { RunnerDeps } from "./job";
import type { RunnerMessage } from "./lifecycle";
import {
  mapSdkMessage,
  composeCloudPrompt,
  type SdkWireMessage,
} from "./sdk-map";
import { resolveAnthropicKey } from "../anthropic-key";
import { ensureAgentUser, type AgentUser } from "./agent-user";
import { parseRunnerConfig } from "./config";
import { resultBranchName } from "./pr-body";
import {
  pristineClone,
  agentWorktree,
  exportAgentWork,
  publishBundle,
} from "./git-ops";
import { scrubSecrets } from "./scrub";

/** execFile-shaped (no shell) exec for agent-user provisioning. */
const execForUser = async (command: string, args: string[]) => {
  const { stdout } = await execFileAsync(command, args, { timeout: 30_000 });
  return { stdout };
};

const execFileAsync = promisify(execFile);

/**
 * 65.3 — everything one job touches lives under one runner-owned dir:
 *   <job>/pristine  0700, runner only (clone with credentials-in-env)
 *   <job>/work      the agent's checkout (chowned to the agent uid)
 *   <job>/home      the agent's HOME for this job only (+ home/tmp)
 *   <job>/out       where the agent-uid export writes its bundle
 * Removed in cleanup(), so nothing survives into the next tenant's job.
 */
interface JobState {
  jobDir: string;
  pristine: string;
  base: string;
  home: string;
  out: string;
  githubRepo: string;
}

export interface RealDepsOptions {
  /** Test seam: where to clone from (default https://github.com/<repo>.git). */
  repoUrl?: (githubRepo: string) => string;
  /** Test seam: the unprivileged agent user (default: provision tsagent). */
  agentUser?: () => Promise<AgentUser | null>;
}

const githubUrl = (repo: string) => `https://github.com/${repo}.git`;

/** Kill every process the agent uid still owns (65.3). */
async function killAgentProcesses(agentUser: AgentUser): Promise<void> {
  await new Promise<void>((done) => {
    const child = spawn(
      process.execPath,
      ["-e", "try { process.kill(-1, 'SIGKILL') } catch {}"],
      { uid: agentUser.uid, gid: agentUser.gid, stdio: "ignore" },
    );
    child.on("exit", () => done());
    child.on("error", () => done());
  });
}

const FILE_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "NotebookEdit",
  "Glob",
  "Grep",
]);
const PATH_KEYS = ["file_path", "path", "notebook_path"];

/** File tools must stay inside the clone; everything else is allowed. */
/**
 * 60.4 [1.0.D5] — resolve symlinks before checking containment: a link
 * inside the clone that points outside it (planted by the repo or the
 * agent) must count as outside. For a path that doesn't exist yet (Write
 * of a new file), the deepest existing ancestor is resolved and the rest
 * appended.
 */
/**
 * null = refuse: the path runs through a dangling symlink or a symlink
 * loop. Security review — following a dangling link's target by text
 * (`resolve` collapses `..`) can disagree with how the kernel walks it
 * through other symlinks, so those paths fail closed instead.
 */
function realResolve(path: string): string | null {
  // Deepest component that exists AS AN ENTRY (lstat sees dangling links).
  let existing = path;
  const tail: string[] = [];
  for (;;) {
    try {
      lstatSync(existing);
      break;
    } catch {
      const parent = dirname(existing);
      if (parent === existing) return path;
      tail.unshift(basename(existing));
      existing = parent;
    }
  }
  try {
    return join(realpathSync(existing), ...tail);
  } catch {
    // realpath fails on a dangling link (ENOENT) or a loop (ELOOP).
    return null;
  }
}

export function classifyToolUse(
  toolName: string,
  input: Record<string, unknown>,
  rawWorkdir: string,
): { allowed: true } | { allowed: false; reason: string } {
  if (!FILE_TOOLS.has(toolName)) return { allowed: true };
  const workdir = realResolve(rawWorkdir) ?? rawWorkdir;
  for (const key of PATH_KEYS) {
    const value = input[key];
    if (typeof value !== "string" || value.length === 0) continue;
    const resolved = realResolve(resolve(rawWorkdir, value));
    if (resolved === null) {
      return { allowed: false, reason: `${key} goes through a dangling or looping symlink` };
    }
    if (resolved !== workdir && !resolved.startsWith(workdir + "/")) {
      return {
        allowed: false,
        reason: `${key} resolves outside the workspace`,
      };
    }
  }
  return { allowed: true };
}

async function trustWorkdir(workdir: string, home: string): Promise<void> {
  const configPath = join(home, ".claude.json");
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch {
    // first run — no config yet
  }
  const projects = (config.projects ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  projects[workdir] = {
    ...(projects[workdir] ?? {}),
    hasTrustDialogAccepted: true,
  };
  config.projects = projects;
  await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
}

export function buildRealDeps(
  prisma: PrismaClient,
  options: RealDepsOptions = {},
): RunnerDeps {
  const config = parseRunnerConfig();
  const repoUrl = options.repoUrl ?? githubUrl;
  const getAgentUser =
    options.agentUser ?? (() => ensureAgentUser(execForUser));
  const jobs = new Map<string, JobState>();

  return {
    async cloneRepo(githubRepo: string): Promise<string> {
      const jobDir = await mkdtemp(join(tmpdir(), "runner-"));
      // Traversable (so the agent can reach work/ and home/) but not
      // listable; pristine/ itself is 0700.
      await chmod(jobDir, 0o711);
      try {
        const { pristine, base } = await pristineClone({
          url: repoUrl(githubRepo),
          token: process.env.GITHUB_TOKEN ?? null,
          dir: join(jobDir, "pristine"),
        });
        await chmod(pristine, 0o700);
        const workdir = join(jobDir, "work");
        await agentWorktree({ pristine, workdir, publicUrl: githubUrl(githubRepo) });
        const home = join(jobDir, "home");
        const out = join(jobDir, "out");
        await mkdir(join(home, "tmp"), { recursive: true });
        await mkdir(out, { recursive: true });
        jobs.set(workdir, { jobDir, pristine, base, home, out, githubRepo });
        return workdir;
      } catch (error) {
        // R17 — a failed clone must not leak its temp dir.
        await rm(jobDir, { recursive: true, force: true });
        throw error;
      }
    },

    async *runAgent(args: {
      workdir: string;
      dispatch: Dispatch;
      signal?: AbortSignal;
    }): AsyncGenerator<RunnerMessage> {
      const job = jobs.get(args.workdir);
      if (!job) throw new Error("runAgent called for an unknown workdir");

      // 65.4 — whose key pays. Non-admins run on their own key only; a
      // broken stored key is an error, never a silent app-key fallback.
      const owner = args.dispatch.ownerUserId
        ? await prisma.user.findUnique({
            where: { id: args.dispatch.ownerUserId },
            select: { role: true },
          })
        : null;
      if (!owner) throw new Error("Cloud dispatch has no owner");
      const resolved = await resolveAnthropicKey(
        prisma,
        args.dispatch.ownerUserId,
        { strict: true },
      );
      if (resolved.source !== "user" && owner.role !== "admin") {
        throw new Error(
          "Cloud runs use your own Anthropic key. Add one in Settings, then dispatch again.",
        );
      }
      if (!resolved.key) throw new Error("No Anthropic key available for this run");

      // [52.D1] Unprivileged uid so the agent cannot read the runner's
      // /proc/<pid>/environ. Degrades to same-uid with a warning on dev
      // boxes where provisioning is impossible.
      const agentUser = await getAgentUser();
      if (agentUser) {
        for (const dir of [args.workdir, job.home, job.out]) {
          await execFileAsync(
            "chown",
            ["-R", `${agentUser.uid}:${agentUser.gid}`, dir],
            { timeout: 60_000 },
          );
        }
      } else {
        console.warn(
          "[runner] agent user unavailable — running the session same-uid ([52.D1])",
        );
      }

      // Headless Claude Code refuses untrusted workspaces; pre-trust the
      // clone in this job's own HOME.
      await trustWorkdir(args.workdir, job.home);
      if (agentUser) {
        await execFileAsync(
          "chown",
          [`${agentUser.uid}:${agentUser.gid}`, join(job.home, ".claude.json")],
          { timeout: 30_000 },
        ).catch(() => {});
      }
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      const prompt = composeCloudPrompt(
        args.dispatch.mode,
        args.dispatch.customPrompt,
      );
      // Autonomy is enforced at enqueue AND at claim (lib/runner/autonomy.ts).
      // No permissionMode is passed on purpose: bypassPermissions skips
      // canUseTool entirely and acceptEdits auto-approves file edits
      // without it; both would drop the path scoping below.
      try {
        // 67.1/67.2 — shutdown, timeout, cancel and a lost claim all stop
        // the agent through this controller.
        const abortController = new AbortController();
        if (args.signal?.aborted) abortController.abort();
        args.signal?.addEventListener("abort", () => abortController.abort(), { once: true });
        const stream = query({
          prompt,
          options: {
            abortController,
            cwd: args.workdir,
            maxTurns: config.maxTurns,
            maxBudgetUsd: config.maxBudgetUsd,
            // 65.3 — no settings from the image, the repo or a previous
            // job; no session files written for the next tenant to find.
            settingSources: [],
            persistSession: false,
            // File tools are path-scoped to the clone; Bash stays open
            // (dispatched sessions run builds/tests) with the container +
            // uid drop as the boundary and no runner secrets in env.
            canUseTool: async (
              toolName: string,
              input: Record<string, unknown>,
            ) => {
              const decision = classifyToolUse(toolName, input, args.workdir);
              if (!decision.allowed) {
                console.warn(`[runner] denied ${toolName}: ${decision.reason}`);
                return { behavior: "deny" as const, message: decision.reason };
              }
              return { behavior: "allow" as const, updatedInput: input };
            },
            env: {
              ANTHROPIC_API_KEY: resolved.key,
              PATH: process.env.PATH ?? "",
              HOME: job.home,
              TMPDIR: join(job.home, "tmp"),
            },
            ...(agentUser
              ? {
                  spawnClaudeCodeProcess: (o: {
                    command: string;
                    args: string[];
                    cwd?: string;
                    env: Record<string, string | undefined>;
                    signal?: AbortSignal;
                  }) =>
                    spawn(o.command, o.args, {
                      cwd: o.cwd,
                      env: o.env as NodeJS.ProcessEnv,
                      signal: o.signal,
                      stdio: ["pipe", "pipe", "pipe"],
                      uid: agentUser.uid,
                      gid: agentUser.gid,
                    }),
                }
              : {}),
          },
        });

        for await (const message of stream) {
          for (const mapped of mapSdkMessage(message as SdkWireMessage)) {
            yield mapped;
          }
        }
      } finally {
        // 65.3 — nothing the agent started outlives the session.
        if (agentUser) await killAgentProcesses(agentUser);
      }
    },

    async pushBranch(args: {
      workdir: string;
      dispatch: Dispatch;
      partial?: boolean;
    }): Promise<{ pushed: boolean; branch: string | null; reason?: string }> {
      const job = jobs.get(args.workdir);
      if (!job) return { pushed: false, branch: null, reason: "unknown workdir" };
      // 65.2 — the agent-uid half: commit leftovers + bundle. Nothing the
      // agent planted ever runs with runner privileges.
      const agentUser = await getAgentUser();
      const exported = await exportAgentWork({
        workdir: args.workdir,
        base: job.base,
        outDir: job.out,
        runAs: agentUser
          ? { uid: agentUser.uid, gid: agentUser.gid, home: job.home }
          : null,
        dispatchId: args.dispatch.id,
      });
      // Export ran as the agent uid (git may have run its filter drivers):
      // kill anything it left behind before the runner reads the bundle,
      // so nothing can swap the file or outlive the job.
      if (agentUser) await killAgentProcesses(agentUser);
      if (!exported.bundle) return { pushed: false, branch: null };
      // The runner half: pristine clone + bundle data + token in env.
      return publishBundle({
        pristine: job.pristine,
        bundle: exported.bundle,
        base: job.base,
        branch: resultBranchName(args.dispatch, args.partial === true),
        remoteUrl: repoUrl(job.githubRepo),
        token: process.env.GITHUB_TOKEN ?? null,
        allowWorkflowChanges: false,
      });
    },

    // Review — claim-time push re-check with the owner's own GitHub token.
    async verifyRepoAccess(args: { userId: string; githubRepo: string }): Promise<boolean> {
      const { verifyRepoPushAccess } = await import("../github-access");
      return (await verifyRepoPushAccess(prisma, args.userId, args.githubRepo)).ok;
    },

    async openPullRequest(args: {
      dispatch: Dispatch;
      branch: string;
      title: string;
      body: string;
    }): Promise<string> {
      const token = process.env.GITHUB_TOKEN;
      if (!token) throw new Error("GITHUB_TOKEN unset — cannot open a PR");
      const project = await prisma.project.findUnique({
        where: { id: args.dispatch.projectId },
        select: { githubRepo: true },
      });
      if (!project?.githubRepo) throw new Error("Project has no GitHub repo");

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      };
      const repoRes = await fetch(
        `https://api.github.com/repos/${project.githubRepo}`,
        { headers },
      );
      if (!repoRes.ok) {
        throw new Error(`GitHub repo lookup failed: ${repoRes.status}`);
      }
      const base = (await repoRes.json()).default_branch as string;

      const prRes = await fetch(
        `https://api.github.com/repos/${project.githubRepo}/pulls`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: scrubSecrets(args.title),
            body: scrubSecrets(args.body),
            head: args.branch,
            base,
          }),
        },
      );
      if (!prRes.ok) {
        throw new Error(
          scrubSecrets(
            `GitHub PR creation failed: ${prRes.status} ${(await prRes.text()).slice(0, 200)}`,
          ),
        );
      }
      return (await prRes.json()).html_url as string;
    },

    async cleanup(workdir: string): Promise<void> {
      const agentUser = await getAgentUser();
      if (agentUser) await killAgentProcesses(agentUser);
      const job = jobs.get(workdir);
      jobs.delete(workdir);
      // 65.3 — the whole job dir: pristine clone, checkout, HOME, bundle.
      await rm(job?.jobDir ?? workdir, { recursive: true, force: true });
    },
  };
}
