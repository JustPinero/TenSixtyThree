/**
 * Phase 48.4 — "Brains": repos designated as knowledge/persona stores.
 *
 * A brain is a git repo (like ~/kilroy-brain) that holds the private, personal
 * layer of the platform: memory, playbook, lessons. Brains are registered from
 * Settings (Brain table); consumers resolve the primary brain here.
 * Resolution: first registered Brain row -> KILROY_BRAIN_PATH env -> null.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@/app/generated/prisma/client";

export function validateBrainPath(path: string): { ok: boolean; error?: string } {
  if (!existsSync(path)) return { ok: false, error: "Path does not exist" };
  if (!existsSync(join(path, ".git"))) {
    return { ok: false, error: "Not a git repository (brains must be repos so knowledge survives + syncs)" };
  }
  return { ok: true };
}

export async function resolveBrainPath(prisma: PrismaClient): Promise<string | null> {
  try {
    const brain = await prisma.brain.findFirst({ orderBy: { id: "asc" } });
    if (brain) return brain.path;
  } catch {
    // table unreadable — fall through to env
  }
  return process.env.KILROY_BRAIN_PATH?.trim() || null;
}
