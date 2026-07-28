import { prisma } from "@/lib/db";
import {
  AI_SERVICE_OPTIONS,
  CHAT_MODEL_OPTIONS,
  resolveAiService,
  resolveChatModel,
} from "@/lib/model-config";

/**
 * Phase 47.1 — AI service + chat model settings.
 * GET: current resolved values + selectable options.
 * PATCH: persist overrides on the single-row CascadeConfig. Passing null
 * clears an override (falls back to env/default resolution).
 */
export async function GET(): Promise<Response> {
  const [model, service] = await Promise.all([
    resolveChatModel(prisma),
    resolveAiService(prisma),
  ]);
  return Response.json({
    model,
    service,
    options: CHAT_MODEL_OPTIONS,
    services: AI_SERVICE_OPTIONS,
  });
}

export async function PATCH(req: Request): Promise<Response> {
  let body: { model?: string | null; service?: string | null };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: { chatModel?: string | null; aiService?: string | null } = {};

  if (body.model !== undefined) {
    if (
      body.model !== null &&
      !CHAT_MODEL_OPTIONS.some((o) => o.id === body.model)
    ) {
      return Response.json(
        { error: `Unknown model: ${body.model}` },
        { status: 400 },
      );
    }
    update.chatModel = body.model;
  }
  if (body.service !== undefined) {
    if (
      body.service !== null &&
      !(AI_SERVICE_OPTIONS as readonly string[]).includes(body.service)
    ) {
      return Response.json(
        { error: `Unknown service: ${body.service}` },
        { status: 400 },
      );
    }
    update.aiService = body.service;
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  await prisma.cascadeConfig.upsert({
    where: { id: 1 },
    update,
    create: { id: 1, ...update },
  });

  const [model, service] = await Promise.all([
    resolveChatModel(prisma),
    resolveAiService(prisma),
  ]);
  return Response.json({ model, service });
}
