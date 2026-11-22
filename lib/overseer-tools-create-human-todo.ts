import type { Tool, ToolContext } from "@/lib/overseer-tools";
import { scopeOf } from "@/lib/tenant-scope";

const VALID_CATEGORIES = [
  "asset",
  "credential",
  "testing",
  "deploy",
  "review",
  "external",
  "other",
] as const;
const VALID_PRIORITIES = ["high", "normal", "low"] as const;

interface CreateHumanTodoInput {
  title: string;
  projectSlug?: string;
  category?: (typeof VALID_CATEGORIES)[number];
  priority?: (typeof VALID_PRIORITIES)[number];
}

interface CreateHumanTodoOutput {
  id: number;
  title: string;
  category: string;
  priority: string;
  projectSlug: string | null;
  /** 69.1 — true when this session had already created the same todo. */
  duplicate?: boolean;
}

/** 69.1 — rows this chat session already created are not created again. */
async function sessionSince(ctx: ToolContext): Promise<Date | null> {
  if (!ctx.sessionId) return null;
  const session = await ctx.prisma.chatSession.findUnique({
    where: { id: ctx.sessionId },
    select: { startedAt: true },
  });
  return session?.startedAt ?? null;
}


export const createHumanTodoTool: Tool<CreateHumanTodoInput, CreateHumanTodoOutput> = {
  name: "create_human_todo",
  description:
    "Create a manual to-do item for the developer. Structured equivalent of the [HUMAN TODO] tag. Use for things only the developer can do (upload assets, get API keys, manual testing, deploy approval, code review, etc.).",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "What the developer needs to do.",
      },
      projectSlug: {
        type: "string",
        description: "Slug of the project this relates to (optional).",
      },
      category: {
        type: "string",
        enum: ["asset", "credential", "testing", "deploy", "review", "external", "other"],
        description: "Categorization for the dashboard. Default 'other'.",
      },
      priority: {
        type: "string",
        enum: ["high", "normal", "low"],
        description: "Priority. Default 'normal'.",
      },
    },
    required: ["title"],
  },
  handler: async (input, ctx) => {
    const category = input.category ?? "other";
    const priority = input.priority ?? "normal";
    if (!VALID_CATEGORIES.includes(category)) {
      throw new Error(`Unknown category "${category}".`);
    }
    if (!VALID_PRIORITIES.includes(priority)) {
      throw new Error(`Unknown priority "${priority}".`);
    }

    // Phase 66.1 — attach only to a project the chatting user can see,
    // and record who the todo belongs to.
    const scope = scopeOf(ctx);
    let projectId: number | null = null;
    if (input.projectSlug) {
      const project = await ctx.prisma.project.findFirst({
        where: { AND: [{ slug: input.projectSlug }, scope.projectWhere] },
        select: { id: true },
      });
      if (!project) {
        throw new Error(`Unknown project slug "${input.projectSlug}".`);
      }
      projectId = project.id;
    }

    // 69.1 — a retried or repeated tool call in the same session must not
    // create the same todo twice.
    const since = await sessionSince(ctx);
    if (since) {
      const existing = await ctx.prisma.humanTask.findFirst({
        where: {
          title: input.title,
          projectId,
          ownerUserId: scope.userId,
          createdBy: "delamain",
          createdAt: { gte: since },
        },
      });
      if (existing) {
        return {
          id: existing.id,
          title: existing.title,
          category: existing.category,
          priority: existing.priority,
          projectSlug: existing.projectSlug,
          duplicate: true,
        };
      }
    }

    const created = await ctx.prisma.humanTask.create({
      data: {
        title: input.title,
        category,
        priority,
        projectSlug: input.projectSlug ?? null,
        projectId,
        createdBy: "delamain",
        ownerUserId: scope.userId,
      },
    });

    return {
      id: created.id,
      title: created.title,
      category: created.category,
      priority: created.priority,
      projectSlug: created.projectSlug,
    };
  },
};
