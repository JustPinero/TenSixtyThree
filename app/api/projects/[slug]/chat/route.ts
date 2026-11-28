import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAnthropicKey } from "@/lib/anthropic-key";
import { isDemoSession } from "@/lib/demo";
import { sseFromText } from "@/lib/sse-text";
import { demoProjectReply } from "@/lib/demo-overseer";
import { resolveChatModel } from "@/lib/model-config";
import { buildProjectSystemPrompt } from "@/lib/project-chat";
import { lessonWhere, scopeForViewer } from "@/lib/tenant-scope";
import { projectPersonaBlock } from "@/lib/persona-prompt";
import { canSeeProject } from "@/lib/project-access";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limiter";
import { validateMessages } from "@/lib/chat-validation";
import { jsonError, requireUser, viewerUserId } from "@/lib/access";
import { attributionFor } from "@/lib/anthropic-usage-log";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = await requireUser(request);
  if (!access.ok) return access.response;
  const chatModel = await resolveChatModel(prisma, viewerUserId(access.viewer));
  const limited = checkRateLimit(
    getRateLimitKey(request, "project-chat"),
    20,
    60_000,
  );
  if (limited) return limited;

  try {
    // 54.2 — BYOK: a signed-in user's own Anthropic key wins; else app key.
    const byokSession = access.viewer.kind === "user" ? access.viewer.session : null;
    // 54.5 — no Anthropic spend from demo sessions.
    // 76 — a scripted reply about the project being viewed, not a refusal.
    if (byokSession && isDemoSession(byokSession)) {
      const { slug: demoSlug } = await params;
      const demoProject = await prisma.project.findUnique({
        where: { slug: demoSlug },
        select: { id: true, name: true },
      });
      if (
        !demoProject ||
        !(await canSeeProject(prisma, byokSession.user.id, demoProject.id))
      ) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      const demoBody: unknown = await request.json().catch(() => null);
      const validated = validateMessages(
        demoBody && typeof demoBody === "object" && "messages" in demoBody
          ? demoBody.messages
          : [],
      );
      const lastAsk = validated.valid
        ? validated.messages.filter((m) => m.role === "user").at(-1)
        : undefined;
      const question = typeof lastAsk?.content === "string" ? lastAsk.content : "";
      return new Response(
        sseFromText(demoProjectReply(demoProject.name, question), {
          model: "demo-canned",
        }),
        { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } },
      );
    }
    const { key: apiKey, source: keySource } = await resolveAnthropicKey(
      prisma,
      byokSession?.user.id ?? null,
    );
    if (!apiKey || !apiKey.startsWith("sk-")) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 },
      );
    }

    const { slug } = await params;
    const body = await request.json();
    const validation = validateMessages(body.messages);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { slug } });
    if (
      !project ||
      // 55.2 — same 404 for projects outside the viewer's scope
      !(await canSeeProject(prisma, byokSession?.user.id ?? null, project.id))
    ) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 53.4 — per-project persona appended after the cached project block,
    // so the prompt-cache prefix stays stable per project.
    const systemPrompt =
      (await buildProjectSystemPrompt(
        prisma,
        project.path,
        project.name,
        lessonWhere(await scopeForViewer(prisma, access.viewer)),
      )) +
      projectPersonaBlock(project.themeKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: chatModel,
        max_tokens: 4096,
        // Phase 23.4 — wrap as cached array. The system prompt is
        // dynamic across projects but stable within a single project
        // session; cache hits land for turn 2+ in the same chat.
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: validation.messages,
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json(
        { error: `Anthropic API error: ${response.status} ${err}` },
        { status: response.status },
      );
    }

    if (!response.body) {
      return NextResponse.json(
        { error: "Anthropic streaming response had no body" },
        { status: 500 },
      );
    }

    // Phase 25.2 — tap the stream for usage telemetry. We split the
    // body into a passthrough for the client and a parser that
    // watches for message_delta events (carries usage). Closes
    // audits/debt.md 23.D3 for this route.
    const start = performance.now();
    const [forClient, forTap] = response.body.tee();
    const { pipeSseEvents } = await import("@/lib/overseer-tools-streaming");
    const { logUsage } = await import("@/lib/anthropic-usage-log");
    void pipeSseEvents(forTap, (event) => {
      if (event.type === "message_delta" && event.usage) {
        logUsage(prisma, {
          callSite: "project.chat",
          model: chatModel,
          usage: event.usage as Parameters<typeof logUsage>[1]["usage"],
          durationMs: Math.round(performance.now() - start),
          // Phase 70 — spend attribution.
          attribution: attributionFor(byokSession?.user.id ?? null, keySource),
        });
      }
    }).catch(() => {
      // tap failures must not break the client stream
    });

    return new Response(forClient, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return jsonError(error, "projects.[slug].chat");
  }
}
