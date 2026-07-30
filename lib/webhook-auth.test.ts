/**
 * [42.D1] — shared-secret auth for the session-complete webhook.
 * Backward compatible: no secret file -> open (loopback bind + containment
 * remain the mitigations); secret file present -> header must match.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkWebhookSecret } from "./webhook-auth";

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe("webhook secret", () => {
  it("allows any request when no secret file exists", () => {
    dir = mkdtempSync(join(tmpdir(), "sec-"));
    const result = checkWebhookSecret(null, join(dir, "nope"));
    expect(result.ok).toBe(true);
  });

  it("requires a matching header when the secret file exists", () => {
    dir = mkdtempSync(join(tmpdir(), "sec-"));
    const f = join(dir, "webhook-secret");
    writeFileSync(f, "s3cret\n");
    expect(checkWebhookSecret("s3cret", f).ok).toBe(true);
    expect(checkWebhookSecret("wrong", f).ok).toBe(false);
    expect(checkWebhookSecret(null, f).ok).toBe(false);
  });
});
