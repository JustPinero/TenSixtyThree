import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  AI_SERVICE_OPTIONS,
  CHAT_MODEL_OPTIONS,
  resolveAiService,
  resolveChatModel,
} from "@/lib/model-config";
import {
  requireAdmin,
  requireNonDemo,
  requireUser,
  viewerUserId,
  type Viewer,
} from "@/lib/access";

/**
 * Phase 47.1 — AI service + chat model settings.
 * Phase 66.3 — the chat model is per user over an admin-set default.
 *
 * GET: the viewer's effective model, the default, their own preference,
 * and whether they may set the default.
 * PATCH { model, scope? }: scope "user" (default for a signed-in user)
 * writes User.chatModel; scope "default" (default for the local
 * operator) writes CascadeConfig.chatModel and needs an admin.
 * PATCH { service } is admin-only. null clears an override.
 */
function canSetDefault(viewer: Viewer): boolean {
  return viewer.kind === "local" || (viewer.isAdmin && !viewer.isDemo);
}

async function describe(viewer: Viewer) {
  const userId = viewerUserId(viewer);
  const [model, defaultModel, service, user] = await Promise.all([
    resolveChatModel(prisma, userId),
    resolveChatModel(prisma, null),
    resolveAiService(prisma),
    userId
      ? prisma.user.findUnique({ where: { id: userId }, select: { chatModel: true } })
      : Promise.resolve(null),
  ]);
  return {
    model,
    defaultModel,
    userModel: user?.chatModel ?? null,
    service,
    canSetDefault: canSetDefault(viewer),
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  return Response.json({
    ...(await describe(access.viewer)),
    options: CHAT_MODEL_OPTIONS,
    services: AI_SERVICE_OPTIONS,
  });
}

export async function PATCH(req: Request): Promise<Response> {
  const access = await requireNonDemo(req);
  if (!access.ok) return access.response;
  let body: { model?: string | null; service?: string | null; scope?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.model === undefined && body.service === undefined) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  if (
    body.model !== undefined &&
    body.model !== null &&
    !CHAT_MODEL_OPTIONS.some((o) => o.id === body.model)
  ) {
    return Response.json({ error: `Unknown model: ${body.model}` }, { status: 400 });
  }
  if (
    body.service !== undefined &&
    body.service !== null &&
    !(AI_SERVICE_OPTIONS as readonly string[]).includes(body.service)
  ) {
    return Response.json({ error: `Unknown service: ${body.service}` }, { status: 400 });
  }

  const scope =
    body.scope === "default" || body.scope === "user"
      ? body.scope
      : access.viewer.kind === "local"
        ? "default"
        : "user";
  const configUpdate: { chatModel?: string | null; aiService?: string | null } = {};

  // Fleet-wide settings: the default model and the service.
  if ((body.model !== undefined && scope === "default") || body.service !== undefined) {
    const admin = await requireAdmin(req);
    if (!admin.ok) return admin.response;
    if (body.model !== undefined && scope === "default") configUpdate.chatModel = body.model;
    if (body.service !== undefined) configUpdate.aiService = body.service;
  }

  if (body.model !== undefined && scope === "user") {
    const userId = viewerUserId(access.viewer);
    if (!userId) {
      return Response.json({ error: "Sign in to set a personal model" }, { status: 400 });
    }
    // A personal model must run on the user's own bill (BYOK) — admins
    // own the app key, so they may pick freely. Clearing is always fine.
    if (body.model !== null) {
      const me = await prisma.user.findUnique({
        where: { id: userId },
        select: { anthropicKeyEnc: true, role: true },
      });
      if (!me?.anthropicKeyEnc && me?.role !== "admin") {
        return Response.json(
          { error: "Add your own Anthropic API key in Settings to choose a model" },
          { status: 400 },
        );
      }
    }
    await prisma.user.update({ where: { id: userId }, data: { chatModel: body.model } });
  }

  if (Object.keys(configUpdate).length > 0) {
    await prisma.cascadeConfig.upsert({
      where: { id: 1 },
      update: configUpdate,
      create: { id: 1, ...configUpdate },
    });
  }

  return Response.json(await describe(access.viewer));
}
