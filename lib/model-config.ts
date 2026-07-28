/**
 * Phase 47.1 — configurable AI service + chat model.
 *
 * The chat surfaces (Overseer, wizard, project chat, feature proposer) resolve
 * their model through here instead of hardcoding IDs. Resolution order:
 *   1. DB override — CascadeConfig.chatModel (set from Settings UI)
 *   2. Env — CASCADE_CHAT_MODEL
 *   3. Default — claude-sonnet-5
 * Unknown model IDs from the DB are ignored (falls through), so a stale row
 * can never wedge chat after a model retirement. Service resolution mirrors
 * this with CascadeConfig.aiService / CASCADE_AI_SERVICE / "claude"; only
 * "claude" is implemented today — the seam exists so another provider can be
 * added without touching call sites.
 */
import type { PrismaClient } from "@/app/generated/prisma/client";

export const DEFAULT_CHAT_MODEL = "claude-sonnet-5";
export const DEFAULT_AI_SERVICE = "claude";

export const CHAT_MODEL_OPTIONS: ReadonlyArray<{
  id: string;
  label: string;
  note: string;
}> = [
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    note: "Default. Near-Opus quality at Sonnet cost.",
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    note: "Previous generation.",
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    note: "Most capable Opus tier; ~2x Sonnet cost.",
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    note: "Fastest and cheapest; lighter reasoning.",
  },
];

const VALID_MODEL_IDS = new Set(CHAT_MODEL_OPTIONS.map((o) => o.id));
export const AI_SERVICE_OPTIONS = ["claude"] as const;

function envModel(): string | null {
  const m = process.env.CASCADE_CHAT_MODEL?.trim();
  return m && VALID_MODEL_IDS.has(m) ? m : null;
}

async function dbConfig(prisma: PrismaClient) {
  try {
    return await prisma.cascadeConfig.findUnique({ where: { id: 1 } });
  } catch {
    return null; // config table unreadable — never block chat on it
  }
}

export async function resolveChatModel(prisma: PrismaClient): Promise<string> {
  const cfg = await dbConfig(prisma);
  const dbModel = cfg?.chatModel?.trim();
  if (dbModel && VALID_MODEL_IDS.has(dbModel)) return dbModel;
  return envModel() ?? DEFAULT_CHAT_MODEL;
}

export async function resolveAiService(prisma: PrismaClient): Promise<string> {
  const cfg = await dbConfig(prisma);
  const dbService = cfg?.aiService?.trim();
  if (
    dbService &&
    (AI_SERVICE_OPTIONS as readonly string[]).includes(dbService)
  )
    return dbService;
  const env = process.env.CASCADE_AI_SERVICE?.trim();
  if (env && (AI_SERVICE_OPTIONS as readonly string[]).includes(env))
    return env;
  return DEFAULT_AI_SERVICE;
}

/** Env-only resolution for lib contexts without DB access (background jobs). */
export function resolveChatModelSync(): string {
  return envModel() ?? DEFAULT_CHAT_MODEL;
}
