import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { resolveAnthropicKey } from "@/lib/anthropic-key";
import { resolveChatModel } from "@/lib/model-config";
import { buildProjectSystemPrompt } from "@/lib/project-chat";
import { projectPersonaBlock } from "@/lib/persona-prompt";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limiter";
import { validateMessages } from "@/lib/chat-validation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const chatModel = await resolveChatModel(prisma);
  const limited = checkRateLimit(
    getRateLimitKey(request, "project-chat"),
    20,
    60_000,
  );
  if (limited) return limited;

  try {
    // 54.2 — BYOK: a signed-in user's own Anthropic key wins; else app key.
    const byokSession = await getServerSession(prisma, request.headers);
    const { key: apiKey } = await resolveAnthropicKey(
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
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // 53.4 — per-project persona appended after the cached project block,
    // so the prompt-cache prefix stays stable per project.
    const systemPrompt =
      (await buildProjectSystemPrompt(prisma, project.path, project.name)) +
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
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
