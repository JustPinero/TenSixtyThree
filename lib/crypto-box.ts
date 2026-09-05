/**
 * 54.2 — AES-256-GCM box for secrets at rest (BYOK Anthropic keys).
 *
 * Format: base64(iv[12] || ciphertext || authTag[16]). ENCRYPTION_KEY is
 * a 32-byte base64 env secret. `open` returns null on any failure —
 * tampering, wrong/rotated key, garbage — callers treat that as "no
 * secret stored" and fall back.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be 32 bytes of base64 (openssl rand -base64 32)",
    );
  }
  return key;
}

export function seal(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, enc, cipher.getAuthTag()]).toString("base64");
}

export function open(boxed: string): string | null {
  try {
    const key = loadKey();
    const buf = Buffer.from(boxed, "base64");
    if (buf.length < IV_LENGTH + TAG_LENGTH + 1) return null;
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(buf.length - TAG_LENGTH);
    const enc = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}
