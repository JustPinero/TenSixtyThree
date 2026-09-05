/**
 * 54.2 — BYOK resolution. A user with a stored (encrypted) Anthropic key
 * runs on their own credits; everyone else rides the app key (Justin's
 * call 2026-09-04: no quotas — "cost of doing business").
 */
import type { PrismaClient } from "@/app/generated/prisma/client";
import { open } from "./crypto-box";

export interface ResolvedKey {
  key: string;
  source: "user" | "app";
}

export async function resolveAnthropicKey(
  prisma: PrismaClient,
  userId: string | null,
): Promise<ResolvedKey> {
  const appKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!userId) return { key: appKey, source: "app" };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { anthropicKeyEnc: true },
  });
  if (!user?.anthropicKeyEnc) return { key: appKey, source: "app" };

  const decrypted = open(user.anthropicKeyEnc);
  if (!decrypted) return { key: appKey, source: "app" };
  return { key: decrypted, source: "user" };
}
