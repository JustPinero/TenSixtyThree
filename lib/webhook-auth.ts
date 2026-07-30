/**
 * [42.D1] — shared-secret auth for /api/webhook/session-complete.
 *
 * The secret lives in ~/.cascade/webhook-secret (created by install-hooks).
 * The canonical Stop-hook script sends it as x-cascade-webhook-secret; the
 * route requires it whenever the file exists. No file = open (backward
 * compatible; loopback bind + containment guard remain the mitigations).
 * Comparison is constant-time to avoid trivial timing probes.
 */
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const WEBHOOK_SECRET_HEADER = "x-cascade-webhook-secret";

export function defaultSecretPath(): string {
  return (
    process.env.CASCADE_WEBHOOK_SECRET_PATH ||
    join(homedir(), ".cascade", "webhook-secret")
  );
}

export function checkWebhookSecret(
  headerValue: string | null,
  secretPath: string = defaultSecretPath()
): { ok: boolean; reason?: string } {
  let secret: string;
  try {
    secret = readFileSync(secretPath, "utf-8").trim();
  } catch {
    return { ok: true }; // no secret configured — open mode
  }
  if (!secret) return { ok: true };
  if (!headerValue) return { ok: false, reason: "missing secret header" };
  const a = Buffer.from(headerValue);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return { ok: false, reason: "secret mismatch" };
  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "secret mismatch" };
}
