import type { Tool, ToolContext } from "@/lib/overseer-tools";
import { scopeOf } from "@/lib/tenant-scope";
import { reminderProjectsVisible } from "@/lib/reminders";

const VALID_TYPES = [
  "project-health",
  "phase-complete",
  "project-deployed",
  "custom",
] as const;
type ConditionType = (typeof VALID_TYPES)[number];

interface CreateReminderInput {
  conditionType: ConditionType;
  conditionValue: string;
  message: string;
  projectSlug?: string;
}

interface CreateReminderOutput {
  id: number;
  message: string;
  conditionType: string;
  conditionValue: string;
  /** 69.1 — true when this session had already created the same reminder. */
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


export const createReminderTool: Tool<CreateReminderInput, CreateReminderOutput> = {
  name: "create_reminder",
  description:
    "Create a reminder that fires when a condition becomes true. Structured equivalent of the [REMINDER] tag. Examples: ramp-up of a project's health, completion of a phase, deployment going live, or a freeform date-based note.",
  inputSchema: {
    type: "object",
    properties: {
      conditionType: {
        type: "string",
        enum: ["project-health", "phase-complete", "project-deployed", "custom"],
        description:
          "What kind of trigger fires this. Use 'custom' for freeform / time-based notes.",
      },
      conditionValue: {
        type: "string",
        description:
          "The trigger value: 'slug:healthy' or 'slug:phase-3' or 'slug' or freeform text.",
      },
      message: {
        type: "string",
        description: "Human-readable reminder body.",
      },
      projectSlug: {
        type: "string",
        description: "Optional project slug this reminder relates to.",
      },
    },
    required: ["conditionType", "conditionValue", "message"],
  },
  handler: async (input, ctx) => {
    if (!VALID_TYPES.includes(input.conditionType)) {
      throw new Error(
        `Unknown conditionType "${input.conditionType}". Valid: ${VALID_TYPES.join(", ")}.`
      );
    }
    // 66.2 — never watch a project the chatting user can't see.
    if (!(await reminderProjectsVisible(ctx.prisma, scopeOf(ctx).projectWhere, input))) {
      throw new Error("Unknown project slug in reminder condition.");
    }
    // 69.1 — idempotent per session.
    const since = await sessionSince(ctx);
    if (since) {
      const existing = await ctx.prisma.reminder.findFirst({
        where: {
          message: input.message,
          conditionType: input.conditionType,
          conditionValue: input.conditionValue,
          ownerUserId: scopeOf(ctx).userId,
          createdBy: "delamain",
          createdAt: { gte: since },
        },
      });
      if (existing) {
        return {
          id: existing.id,
          message: existing.message,
          conditionType: existing.conditionType,
          conditionValue: existing.conditionValue,
          duplicate: true,
        };
      }
    }
    const created = await ctx.prisma.reminder.create({
      data: {
        message: input.message,
        conditionType: input.conditionType,
        conditionValue: input.conditionValue,
        projectSlug: input.projectSlug ?? null,
        createdBy: "delamain",
        // Phase 66.1 — the reminder belongs to the chatting user.
        ownerUserId: scopeOf(ctx).userId,
      },
    });
    return {
      id: created.id,
      message: created.message,
      conditionType: created.conditionType,
      conditionValue: created.conditionValue,
    };
  },
};
