/**
 * Phase 74 — the cloud runner talks to GitHub as a GitHub App, not as the
 * operator.
 *
 * A repo is reachable only if its owner installed the app on it. Each job
 * gets an installation token that GitHub expires after an hour, limited to
 * the one repo the job works on, with contents + pull_requests write only.
 * Combined with the per-user push check (lib/github-access.ts), a user can
 * only run on repos they can push to AND whose owner installed the app.
 *
 * GITHUB_TOKEN (the operator's personal token) is used only when no app is
 * configured — local dev. When the app is configured there is no fallback.
 * Tokens never appear in errors or logs.
 */
import { createSign } from "node:crypto";

export interface GithubAppConfig {
  appId: string;
  privateKey: string;
  slug: string;
}

type Env = Record<string, string | undefined>;
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const API = "https://api.github.com";

export function githubAppConfig(
  env: Env = process.env,
): GithubAppConfig | null {
  const appId = env.GITHUB_APP_ID?.trim();
  const slug = env.GITHUB_APP_SLUG?.trim();
  const raw = env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !slug || !raw) return null;
  // Env UIs often store a PEM with its newlines flattened to "\n".
  const privateKey = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  return { appId, privateKey, slug };
}

export function appInstallUrl(cfg: GithubAppConfig): string {
  return `https://github.com/apps/${cfg.slug}/installations/new`;
}

export class AppNotInstalledError extends Error {
  constructor(
    readonly repo: string,
    readonly installUrl: string,
  ) {
    super(
      `The TenSixtyThree GitHub App isn't installed on ${repo}. Install it here: ${installUrl}`,
    );
    this.name = "AppNotInstalledError";
  }
}

/** App-level JWT (RS256): back-dated 60s for clock skew, 9-minute life. */
export function appJwt(
  cfg: GithubAppConfig,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const enc = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT" });
  const body = enc({
    iat: nowSeconds - 60,
    exp: nowSeconds + 540,
    iss: cfg.appId,
  });
  const sig = createSign("RSA-SHA256")
    .update(`${head}.${body}`)
    .sign(cfg.privateKey)
    .toString("base64url");
  return `${head}.${body}.${sig}`;
}

function appHeaders(cfg: GithubAppConfig): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${appJwt(cfg)}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** The app's installation id for `owner/repo`, or null if not installed. */
export async function installationForRepo(
  cfg: GithubAppConfig,
  repo: string,
  fetchImpl: FetchLike = fetch,
): Promise<number | null> {
  const res = await fetchImpl(`${API}/repos/${repo}/installation`, {
    method: "GET",
    headers: appHeaders(cfg),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error(`GitHub installation lookup failed: ${res.status}`);
  const body = (await res.json()) as { id?: number };
  if (typeof body.id !== "number")
    throw new Error("GitHub installation lookup: no id");
  return body.id;
}

/** A one-hour token for exactly `owner/repo`: contents + PRs, nothing else. */
export async function repoInstallationToken(
  cfg: GithubAppConfig,
  repo: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ token: string; expiresAt: string }> {
  const installationId = await installationForRepo(cfg, repo, fetchImpl);
  if (installationId === null) {
    throw new AppNotInstalledError(repo, appInstallUrl(cfg));
  }
  const res = await fetchImpl(
    `${API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: { ...appHeaders(cfg), "Content-Type": "application/json" },
      body: JSON.stringify({
        repositories: [repo.split("/")[1]],
        permissions: {
          contents: "write",
          pull_requests: "write",
          metadata: "read",
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  // Status only — a body could carry a token.
  if (!res.ok)
    throw new Error(`GitHub installation token request failed: ${res.status}`);
  const body = (await res.json()) as { token?: string; expires_at?: string };
  if (!body.token)
    throw new Error("GitHub installation token response had no token");
  return { token: body.token, expiresAt: body.expires_at ?? "" };
}

/**
 * The token the runner uses for one repo's clone, push and PR. App
 * configured → a scoped installation token (throws AppNotInstalledError;
 * never falls back). No app → GITHUB_TOKEN (local dev) or none.
 */
export async function runnerRepoToken(
  repo: string,
  opts: { env?: Env; fetchImpl?: FetchLike } = {},
): Promise<{ token: string | null; source: "app" | "operator" | "none" }> {
  const env = opts.env ?? process.env;
  const cfg = githubAppConfig(env);
  if (cfg) {
    const minted = await repoInstallationToken(
      cfg,
      repo,
      opts.fetchImpl ?? fetch,
    );
    return { token: minted.token, source: "app" };
  }
  const operator = env.GITHUB_TOKEN;
  return operator
    ? { token: operator, source: "operator" }
    : { token: null, source: "none" };
}
