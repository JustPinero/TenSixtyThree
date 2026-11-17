/**
 * 54.2 — BYOK resolution. A user with a stored (encrypted) Anthropic key
 * runs on their own credits; everyone else rides the app key (Justin's
 * call 2026-09-04: no quotas — "cost of doing business").
 */
import type { PrismaClient } from "@/app/generated/prisma/client";
import { open } from "./crypto-box";

export interface ResolvedKey {
  key: string;
  /** "none" = hosted request with no user: never spend the app key. */
  source: "user" | "app" | "none";
}

export class ByokDecryptError extends Error {
  constructor() {
    super(
      "Your stored Anthropic key could not be decrypted. Re-enter it in Settings.",
    );
    this.name = "ByokDecryptError";
  }
}

export async function resolveAnthropicKey(
  prisma: PrismaClient,
  userId: string | null,
  opts: { strict?: boolean } = {},
): Promise<ResolvedKey> {
  const appKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!userId) {
    // Phase 64.2 — only the local operator rides the app key anonymously.
    if (process.env.AUTH_REQUIRED === "true") return { key: "", source: "none" };
    return { key: appKey, source: "app" };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { anthropicKeyEnc: true },
  });
  if (!user?.anthropicKeyEnc) return { key: appKey, source: "app" };

  const decrypted = open(user.anthropicKeyEnc);
  if (!decrypted) {
    // 65.4 — a stored-but-broken key is the user's key going missing; in
    // strict mode (cloud runs) that is an error, never a silent switch to
    // the app key.
    if (opts.strict) throw new ByokDecryptError();
    return { key: appKey, source: "app" };
  }
  return { key: decrypted, source: "user" };
}
