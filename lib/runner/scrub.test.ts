/** 65.1 — nothing secret survives into stored or logged text. */
import { describe, it, expect, afterEach } from "vitest";
import { scrubSecrets } from "./scrub";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("scrubSecrets", () => {
  it("strips userinfo from URLs", () => {
    const out = scrubSecrets(
      "fatal: could not read from https://x-access-token:abc123@github.com/o/r.git",
    );
    expect(out).not.toContain("abc123");
    expect(out).not.toMatch(/x-access-token:[^*]/);
    expect(out).toContain("github.com/o/r.git");
  });

  it("redacts GitHub and Anthropic token shapes", () => {
    for (const secret of [
      "ghp_" + "a".repeat(36),
      "gho_" + "b".repeat(36),
      "ghs_" + "c".repeat(36),
      "github_pat_" + "d".repeat(60),
      "sk-ant-api03-" + "e".repeat(40),
    ]) {
      expect(scrubSecrets(`token ${secret} end`)).not.toContain(secret);
    }
  });

  it("redacts authorization header values", () => {
    const out = scrubSecrets(
      "AUTHORIZATION: basic eC1hY2Nlc3MtdG9rZW46c2VjcmV0",
    );
    expect(out).not.toContain("eC1hY2Nlc3MtdG9rZW46c2VjcmV0");
    expect(scrubSecrets("Authorization: Bearer abc.def.ghi")).not.toContain(
      "abc.def.ghi",
    );
  });

  it("redacts the literal values of runner secrets in env", () => {
    process.env.GITHUB_TOKEN = "plain-opaque-token-value";
    process.env.DATABASE_URL = "postgres://u:p@db.internal:5432/x";
    const out = scrubSecrets(
      "boom plain-opaque-token-value and postgres://u:p@db.internal:5432/x",
    );
    expect(out).not.toContain("plain-opaque-token-value");
    expect(out).not.toContain("u:p@db.internal");
  });

  it("phase 74 — redacts the GitHub App private key, raw or \\n-escaped, and any PEM block", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAsecretsecretsecret\nmorekeymaterial\n-----END RSA PRIVATE KEY-----";
    process.env.GITHUB_APP_PRIVATE_KEY = pem.replace(/\n/g, "\\n");
    try {
      expect(scrubSecrets(`raw ${pem} end`)).not.toMatch(/secretsecret|morekeymaterial/);
      expect(scrubSecrets(`esc ${process.env.GITHUB_APP_PRIVATE_KEY} end`)).not.toMatch(
        /secretsecret|morekeymaterial/,
      );
    } finally {
      delete process.env.GITHUB_APP_PRIVATE_KEY;
    }
    const other =
      "-----BEGIN PRIVATE KEY-----\nAAAAunrelatedkey\n-----END PRIVATE KEY-----";
    expect(scrubSecrets(`x ${other} y`)).toBe("x [redacted] y");
  });

  it("leaves ordinary text alone", () => {
    expect(scrubSecrets("tests failed: 3 of 40")).toBe("tests failed: 3 of 40");
  });
});
