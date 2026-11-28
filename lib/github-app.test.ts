/**
 * Phase 74 — the cloud runner talks to GitHub as a GitHub App.
 *
 * Each job gets an installation token that expires in an hour and is
 * limited to the one repo it works on (contents + pull requests only).
 * The app only reaches repos whose owners installed it. The operator's
 * personal GITHUB_TOKEN is used only when no app is configured (local dev).
 */
import { describe, it, expect, vi } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import {
  githubAppConfig,
  appJwt,
  installationForRepo,
  repoInstallationToken,
  runnerRepoToken,
  appInstallUrl,
  AppNotInstalledError,
} from "./github-app";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const ENV = {
  GITHUB_APP_ID: "12345",
  GITHUB_APP_PRIVATE_KEY: privateKey,
  GITHUB_APP_SLUG: "tensixtythree-runner",
};

function b64urlJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

type Call = { url: string; init: RequestInit };
function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const key = `${init.method ?? "GET"} ${url}`;
    const hit = routes[key];
    if (!hit) return new Response("{}", { status: 599 });
    return new Response(JSON.stringify(hit.body ?? {}), { status: hit.status });
  });
  return { impl, calls };
}

describe("githubAppConfig", () => {
  it("is null unless id, key and slug are all set", () => {
    expect(githubAppConfig({})).toBeNull();
    expect(githubAppConfig({ ...ENV, GITHUB_APP_SLUG: "" })).toBeNull();
    expect(githubAppConfig(ENV)?.appId).toBe("12345");
  });

  it("accepts a key whose newlines were flattened to \\n (how env UIs store PEMs)", () => {
    const flat = privateKey.replace(/\n/g, "\\n");
    const cfg = githubAppConfig({ ...ENV, GITHUB_APP_PRIVATE_KEY: flat });
    expect(cfg?.privateKey).toBe(privateKey);
  });
});

describe("appJwt", () => {
  it("is an RS256 JWT issued by the app, valid for under 10 minutes, back-dated for clock skew", () => {
    const cfg = githubAppConfig(ENV)!;
    const now = 1_800_000_000;
    const jwt = appJwt(cfg, now);
    const [h, p, sig] = jwt.split(".");
    expect(b64urlJson(h)).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = b64urlJson(p);
    expect(claims.iss).toBe("12345");
    expect(claims.iat).toBe(now - 60);
    expect((claims.exp as number) - now).toBeLessThanOrEqual(600);
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${p}`)
      .verify(publicKey, Buffer.from(sig, "base64url"));
    expect(ok).toBe(true);
  });
});

describe("installation lookup and tokens", () => {
  const cfg = githubAppConfig(ENV)!;

  it("finds the installation for a repo, or null when the app isn't installed there", async () => {
    const yes = fakeFetch({
      "GET https://api.github.com/repos/o/r/installation": {
        status: 200,
        body: { id: 77 },
      },
    });
    expect(await installationForRepo(cfg, "o/r", yes.impl)).toBe(77);
    expect(
      String(
        (yes.calls[0].init.headers as Record<string, string>).Authorization,
      ),
    ).toMatch(/^Bearer ey/);
    const no = fakeFetch({
      "GET https://api.github.com/repos/o/r/installation": { status: 404 },
    });
    expect(await installationForRepo(cfg, "o/r", no.impl)).toBeNull();
  });

  it("mints a token limited to the one repo with contents + pull_requests write only", async () => {
    const f = fakeFetch({
      "GET https://api.github.com/repos/o/r/installation": {
        status: 200,
        body: { id: 77 },
      },
      "POST https://api.github.com/app/installations/77/access_tokens": {
        status: 201,
        body: { token: "ghs_minted", expires_at: "2030-01-01T00:00:00Z" },
      },
    });
    const t = await repoInstallationToken(cfg, "o/r", f.impl);
    expect(t.token).toBe("ghs_minted");
    const body = JSON.parse(String(f.calls[1].init.body)) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      repositories: ["r"],
      permissions: {
        contents: "write",
        pull_requests: "write",
        metadata: "read",
      },
    });
  });

  it("throws AppNotInstalledError with the install link when the repo hasn't installed the app", async () => {
    const f = fakeFetch({
      "GET https://api.github.com/repos/o/r/installation": { status: 404 },
    });
    await expect(
      repoInstallationToken(cfg, "o/r", f.impl),
    ).rejects.toBeInstanceOf(AppNotInstalledError);
    await expect(repoInstallationToken(cfg, "o/r", f.impl)).rejects.toThrow(
      appInstallUrl(cfg),
    );
  });

  it("a failed token request never echoes the response body (it could carry a token)", async () => {
    const f = fakeFetch({
      "GET https://api.github.com/repos/o/r/installation": {
        status: 200,
        body: { id: 77 },
      },
      "POST https://api.github.com/app/installations/77/access_tokens": {
        status: 500,
        body: { token: "ghs_secret_leak" },
      },
    });
    await expect(repoInstallationToken(cfg, "o/r", f.impl)).rejects.not.toThrow(
      /ghs_/,
    );
  });
});

describe("runnerRepoToken", () => {
  it("uses the app when configured, and never falls back to the operator token", async () => {
    const f = fakeFetch({
      "GET https://api.github.com/repos/o/r/installation": { status: 404 },
    });
    await expect(
      runnerRepoToken("o/r", {
        env: { ...ENV, GITHUB_TOKEN: "ghp_operator" },
        fetchImpl: f.impl,
      }),
    ).rejects.toBeInstanceOf(AppNotInstalledError);
  });

  it("without an app, uses GITHUB_TOKEN (local dev) or nothing (public repos)", async () => {
    const f = fakeFetch({});
    expect(
      await runnerRepoToken("o/r", {
        env: { GITHUB_TOKEN: "ghp_x" },
        fetchImpl: f.impl,
      }),
    ).toEqual({
      token: "ghp_x",
      source: "operator",
    });
    expect(
      await runnerRepoToken("o/r", { env: {}, fetchImpl: f.impl }),
    ).toEqual({
      token: null,
      source: "none",
    });
    expect(f.impl).not.toHaveBeenCalled();
  });
});
