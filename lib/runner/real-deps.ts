/**
 * 52.2 — production RunnerDeps: shallow git clone, Agent SDK stream,
 * scratch-dir cleanup. The SDK is imported dynamically so the Next.js
 * web build never bundles it — only scripts/runner.ts walks this path.
 *
 * Auth: the dispatch owner's BYOK key wins (resolveAnthropicKey), else
 * the app key. GITHUB_TOKEN (optional) unlocks private-repo clones —
 * without it public repos still work and private ones fail with a clear
 * error on the Dispatch row.
 */
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
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

/** execFile-shaped (no shell) exec for agent-user provisioning. */
const execForUser = async (command: string, args: string[]) => {
  const { stdout } = await execFileAsync(command, args, { timeout: 30_000 });
  return { stdout };
};

const execFileAsync = promisify(execFile);

const MAX_TURNS = Number(process.env.RUNNER_MAX_TURNS ?? 40);
const MAX_BUDGET_USD = Number(process.env.RUNNER_MAX_BUDGET_USD ?? 5);

function cloneUrl(githubRepo: string): string {
  const token = process.env.GITHUB_TOKEN;
  return token
    ? `https://x-access-token:${token}@github.com/${githubRepo}.git`
    : `https://github.com/${githubRepo}.git`;
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
export function classifyToolUse(
  toolName: string,
  input: Record<string, unknown>,
  workdir: string,
): { allowed: true } | { allowed: false; reason: string } {
  if (!FILE_TOOLS.has(toolName)) return { allowed: true };
  for (const key of PATH_KEYS) {
    const value = input[key];
    if (typeof value !== "string" || value.length === 0) continue;
    const resolved = resolve(workdir, value);
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

export function buildRealDeps(prisma: PrismaClient): RunnerDeps {
  return {
    async cloneRepo(githubRepo: string): Promise<string> {
      const workdir = await mkdtemp(join(tmpdir(), "runner-"));
      await execFileAsync(
        "git",
        ["clone", "--depth", "1", cloneUrl(githubRepo), workdir],
        { timeout: 120_000 },
      );
      // Security review 52: the credentialed clone URL lands in
      // .git/config, readable by the agent — strip it back to the
      // public URL immediately.
      await execFileAsync(
        "git",
        ["-C", workdir, "remote", "set-url", "origin",
         `https://github.com/${githubRepo}.git`],
        { timeout: 10_000 },
      );
      return workdir;
    },

    async *runAgent(args: {
      workdir: string;
      dispatch: Dispatch;
    }): AsyncGenerator<RunnerMessage> {
      // [52.D1] Run the agent as an unprivileged uid so it cannot read
      // the runner's /proc/<pid>/environ. Degrades to same-uid with a
      // warning where provisioning isn't possible (dev boxes, non-root).
      const agentUser: AgentUser | null = await ensureAgentUser(execForUser);
      const home = agentUser?.home ?? homedir();
      if (agentUser) {
        await execFileAsync(
          "chown",
          ["-R", `${agentUser.uid}:${agentUser.gid}`, args.workdir],
          { timeout: 60_000 },
        );
      } else {
        console.warn(
          "[runner] agent user unavailable — running the session same-uid ([52.D1])",
        );
      }

      // Headless Claude Code refuses untrusted workspaces (repos carrying
      // .claude/settings.json). Pre-trust the ephemeral clone dir.
      await trustWorkdir(args.workdir, home);
      if (agentUser) {
        await execFileAsync(
          "chown",
          [`${agentUser.uid}:${agentUser.gid}`, join(home, ".claude.json")],
          { timeout: 30_000 },
        ).catch(() => {});
      }
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      const { key } = await resolveAnthropicKey(
        prisma,
        args.dispatch.ownerUserId,
      );
      const prompt = composeCloudPrompt(
        args.dispatch.mode,
        args.dispatch.customPrompt,
      );

      const stream = query({
        prompt,
        options: {
          cwd: args.workdir,
          maxTurns: MAX_TURNS,
          // The runner CONTAINER is the sandbox (dedicated Railway
          // service, no host mounts) — but the CLI refuses
          // --dangerously-skip-permissions as root, so tools are granted
          // through the programmatic canUseTool callback instead (also
          // the pattern the 52 security review preferred). The agent
          // still never sees runner secrets: subprocess env is an
          // explicit allowlist, not process.env.
          // Security posture (reviewed, accepted 52): file tools are
          // path-scoped to the clone; Bash stays open because dispatched
          // sessions legitimately run arbitrary builds/tests — the same
          // full-autonomy posture as local dispatches, with the container
          // as the boundary and no runner secrets in the agent env.
          // [52.D1] uid-separation for the agent subprocess is the real
          // fix for same-uid /proc reads — logged in audits/debt.md.
          canUseTool: async (
            toolName: string,
            input: Record<string, unknown>,
          ) => {
            const decision = classifyToolUse(toolName, input, args.workdir);
            if (!decision.allowed) {
              console.warn(
                `[runner] denied ${toolName}: ${decision.reason}`,
              );
              return { behavior: "deny" as const, message: decision.reason };
            }
            return { behavior: "allow" as const, updatedInput: input };
          },
          env: {
            ANTHROPIC_API_KEY: key,
            PATH: process.env.PATH ?? "",
            HOME: home,
            ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
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
          ...(Number.isFinite(MAX_BUDGET_USD)
            ? { maxBudgetUsd: MAX_BUDGET_USD }
            : {}),
        },
      });

      for await (const message of stream) {
        for (const mapped of mapSdkMessage(message as SdkWireMessage)) {
          yield mapped;
        }
      }
    },

    async pushBranch(args: {
      workdir: string;
      dispatch: Dispatch;
    }): Promise<{ pushed: boolean; branch: string | null }> {
      const { workdir, dispatch } = args;
      // Anything uncommitted the agent left behind gets committed too.
      const status = await execFileAsync(
        "git",
        ["-C", workdir, "status", "--porcelain"],
        { timeout: 30_000 },
      );
      if (status.stdout.trim()) {
        await execFileAsync(
          "git",
          ["-C", workdir, "add", "-A"],
          { timeout: 30_000 },
        );
        await execFileAsync(
          "git",
          [
            "-C", workdir,
            "-c", "user.name=TenSixtyThree Runner",
            "-c", "user.email=runner@tensixtythree.com",
            "commit", "-m", `cloud ${dispatch.mode}: session work (dispatch ${dispatch.id})`,
          ],
          { timeout: 30_000 },
        );
      }
      // No commits beyond the clone point → nothing to publish.
      const ahead = await execFileAsync(
        "git",
        ["-C", workdir, "rev-list", "--count", "origin/HEAD..HEAD"],
        { timeout: 30_000 },
      ).catch(() => ({ stdout: "0" }));
      if (Number(ahead.stdout.trim()) === 0) {
        return { pushed: false, branch: null };
      }
      const project = await prisma.project.findUnique({
        where: { id: dispatch.projectId },
        select: { githubRepo: true },
      });
      if (!project?.githubRepo) return { pushed: false, branch: null };
      const branch = `cloud/${dispatch.id}`;
      // Push straight to a credentialed URL — never persisted in .git/config.
      await execFileAsync(
        "git",
        ["-C", workdir, "push", cloneUrl(project.githubRepo), `HEAD:refs/heads/${branch}`],
        { timeout: 120_000 },
      );
      return { pushed: true, branch };
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
            title: args.title,
            body: args.body,
            head: args.branch,
            base,
          }),
        },
      );
      if (!prRes.ok) {
        throw new Error(
          `GitHub PR creation failed: ${prRes.status} ${(await prRes.text()).slice(0, 200)}`,
        );
      }
      return (await prRes.json()).html_url as string;
    },

    async cleanup(workdir: string): Promise<void> {
      await rm(workdir, { recursive: true, force: true });
    },
  };
}
