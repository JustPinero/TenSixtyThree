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
import { join } from "node:path";
import { execFile } from "node:child_process";
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

const execFileAsync = promisify(execFile);

const MAX_TURNS = Number(process.env.RUNNER_MAX_TURNS ?? 40);
const MAX_BUDGET_USD = Number(process.env.RUNNER_MAX_BUDGET_USD ?? 5);

function cloneUrl(githubRepo: string): string {
  const token = process.env.GITHUB_TOKEN;
  return token
    ? `https://x-access-token:${token}@github.com/${githubRepo}.git`
    : `https://github.com/${githubRepo}.git`;
}

async function trustWorkdir(workdir: string): Promise<void> {
  const configPath = join(homedir(), ".claude.json");
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
      // Headless Claude Code refuses untrusted workspaces (repos carrying
      // .claude/settings.json). Pre-trust the ephemeral clone dir.
      await trustWorkdir(args.workdir);
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
          // bypassPermissions is deliberate: the runner CONTAINER is the
          // sandbox (dedicated Railway service, no host mounts). What the
          // agent must never see is the runner's own secrets — so the
          // subprocess env is an explicit allowlist, not process.env
          // (security review 52: DATABASE_URL/GITHUB_TOKEN/ENCRYPTION_KEY
          // would otherwise be one `env` call away from a hostile repo's
          // injected prompt).
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          env: {
            ANTHROPIC_API_KEY: key,
            PATH: process.env.PATH ?? "",
            HOME: process.env.HOME ?? "/tmp",
            ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
          },
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

    async cleanup(workdir: string): Promise<void> {
      await rm(workdir, { recursive: true, force: true });
    },
  };
}
