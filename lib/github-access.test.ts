/**
 * Security review (critical) — connecting a repo must be authorized by the
 * USER's own GitHub credentials, never assumed. Otherwise any invited user
 * could point the runner (which clones and pushes with the operator's
 * GITHUB_TOKEN) at the operator's private repos.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { verifyRepoPushAccess } from "./github-access";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

async function userWithGithub(token: string | null) {
  rig = await createDispatchRig({ fakeTimers: false });
  await rig.prisma.user.create({
    data: { id: "u1", name: "u", email: "u@x.dev" },
  });
  if (token !== null) {
    await rig.prisma.account.create({
      data: {
        id: "a1",
        accountId: "gh-1",
        providerId: "github",
        userId: "u1",
        accessToken: token,
      },
    });
  }
  return rig.prisma;
}

function ghResponse(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("verifyRepoPushAccess", () => {
  it("ok when the user's own token has push on the repo", async () => {
    const prisma = await userWithGithub("gho_user");
    const fetchImpl = ghResponse(200, {
      permissions: { push: true, admin: false },
    });
    expect(
      await verifyRepoPushAccess(prisma, "u1", "acme/site", fetchImpl),
    ).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/site",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer gho_user" }),
      }),
    );
  });

  it("refuses read-only access", async () => {
    const prisma = await userWithGithub("gho_user");
    const res = await verifyRepoPushAccess(
      prisma,
      "u1",
      "acme/site",
      ghResponse(200, { permissions: { push: false } }),
    );
    expect(res).toEqual({ ok: false, reason: "no-push" });
  });

  it("refuses a repo the user's token cannot see", async () => {
    const prisma = await userWithGithub("gho_user");
    const res = await verifyRepoPushAccess(
      prisma,
      "u1",
      "operator/private",
      ghResponse(404, {}),
    );
    expect(res).toEqual({ ok: false, reason: "not-found" });
  });

  it("refuses when the user has no GitHub sign-in (never falls back to the operator token)", async () => {
    const prisma = await userWithGithub(null);
    const fetchImpl = ghResponse(200, { permissions: { push: true } });
    const res = await verifyRepoPushAccess(
      prisma,
      "u1",
      "acme/site",
      fetchImpl,
    );
    expect(res).toEqual({ ok: false, reason: "no-github-account" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a network failure is a refusal, not a pass", async () => {
    const prisma = await userWithGithub("gho_user");
    const res = await verifyRepoPushAccess(
      prisma,
      "u1",
      "acme/site",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    expect(res).toEqual({ ok: false, reason: "unreachable" });
  });
});
