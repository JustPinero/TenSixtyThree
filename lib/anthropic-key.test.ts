import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { seal } from "./crypto-box";
import { resolveAnthropicKey } from "./anthropic-key";

let rig: DispatchRig | null = null;

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 5).toString("base64"));
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-app-key");
});
afterEach(async () => {
  await rig?.dispose();
  rig = null;
  vi.unstubAllEnvs();
});

describe("resolveAnthropicKey", () => {
  it("returns the app key for anonymous callers", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const resolved = await resolveAnthropicKey(rig.prisma, null);
    expect(resolved).toEqual({ key: "sk-app-key", source: "app" });
  });

  it("returns the app key for users without a stored key", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await rig.prisma.user.create({
      data: { id: "u1", name: "t", email: "t@x.dev" },
    });
    const resolved = await resolveAnthropicKey(rig.prisma, "u1");
    expect(resolved).toEqual({ key: "sk-app-key", source: "app" });
  });

  it("returns the user's decrypted key when stored", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await rig.prisma.user.create({
      data: {
        id: "u2",
        name: "t",
        email: "t2@x.dev",
        anthropicKeyEnc: seal("sk-user-own-key"),
      },
    });
    const resolved = await resolveAnthropicKey(rig.prisma, "u2");
    expect(resolved).toEqual({ key: "sk-user-own-key", source: "user" });
  });

  it("falls back to the app key when decryption fails (rotated ENCRYPTION_KEY)", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await rig.prisma.user.create({
      data: {
        id: "u3",
        name: "t",
        email: "t3@x.dev",
        anthropicKeyEnc: seal("sk-user-own-key"),
      },
    });
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 6).toString("base64"));
    const resolved = await resolveAnthropicKey(rig.prisma, "u3");
    expect(resolved).toEqual({ key: "sk-app-key", source: "app" });
  });
});
