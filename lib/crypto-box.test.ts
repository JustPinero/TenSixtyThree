import { describe, it, expect, beforeEach, vi } from "vitest";
import { seal, open } from "./crypto-box";

const KEY_A = Buffer.alloc(32, 7).toString("base64");
const KEY_B = Buffer.alloc(32, 9).toString("base64");

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("ENCRYPTION_KEY", KEY_A);
});

describe("crypto-box", () => {
  it("round-trips a secret", () => {
    const boxed = seal("sk-ant-secret123");
    expect(open(boxed)).toBe("sk-ant-secret123");
  });

  it("never stores plaintext and uses a random IV per seal", () => {
    const a = seal("same-secret");
    const b = seal("same-secret");
    expect(a).not.toContain("same-secret");
    expect(a).not.toBe(b);
  });

  it("returns null on tampered ciphertext", () => {
    const boxed = seal("secret");
    const tampered =
      boxed.slice(0, boxed.length - 4) +
      (boxed.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(open(tampered)).toBeNull();
  });

  it("returns null when opened under a different key", () => {
    const boxed = seal("secret");
    vi.stubEnv("ENCRYPTION_KEY", KEY_B);
    expect(open(boxed)).toBeNull();
  });

  it("throws a clear error when ENCRYPTION_KEY is missing or malformed", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => seal("x")).toThrow(/ENCRYPTION_KEY/);
    vi.stubEnv("ENCRYPTION_KEY", "tooshort");
    expect(() => seal("x")).toThrow(/ENCRYPTION_KEY/);
  });

  it("open returns null on garbage input", () => {
    expect(open("not-a-box")).toBeNull();
    expect(open("")).toBeNull();
  });
});
