/**
 * Security review (critical) — prove a user may write to a GitHub repo
 * before it becomes their project.
 *
 * The cloud runner clones and pushes with the operator's GITHUB_TOKEN.
 * If connecting a repo were unchecked, any invited user could point it at
 * a repo only the operator can reach. So the check uses the USER's own
 * GitHub OAuth token (Better Auth Account, providerId "github") and
 * requires `permissions.push`. No GitHub sign-in, no access, an error or
 * a timeout: refused. It never falls back to the operator token.
 */
import type { PrismaClient } from "@/app/generated/prisma/client";

export type RepoAccess =
  | { ok: true }
  | {
      ok: false;
      reason: "no-github-account" | "not-found" | "no-push" | "unreachable";
    };

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function verifyRepoPushAccess(
  prisma: PrismaClient,
  userId: string,
  repo: string,
  fetchImpl: FetchLike = fetch,
): Promise<RepoAccess> {
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "github", accessToken: { not: null } },
    select: { accessToken: true },
  });
  if (!account?.accessToken) return { ok: false, reason: "no-github-account" };

  try {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${account.accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 403 || res.status === 401) {
      return { ok: false, reason: "not-found" };
    }
    if (!res.ok) return { ok: false, reason: "unreachable" };
    const body = (await res.json()) as {
      permissions?: { push?: boolean; admin?: boolean };
    };
    return body.permissions?.push === true || body.permissions?.admin === true
      ? { ok: true }
      : { ok: false, reason: "no-push" };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export const REPO_ACCESS_MESSAGE: Record<
  Exclude<RepoAccess, { ok: true }>["reason"],
  string
> = {
  "no-github-account":
    "Sign in with GitHub first (Settings → link GitHub), so we can confirm you can push to this repository.",
  "not-found":
    "Your GitHub account can't see that repository. For a private repo, sign in with GitHub again and grant repository access.",
  "no-push": "Your GitHub account can read that repository but not push to it.",
  unreachable:
    "Couldn't reach GitHub to confirm access. Try again in a moment.",
};
