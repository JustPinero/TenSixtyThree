import { PrismaClient, type Prisma } from "@/app/generated/prisma/client";
import { visibleProjectFilter } from "@/lib/project-access";

/**
 * Phase 66.2 — the project a reminder watches, if any. A reminder on a
 * project its owner cannot see would leak that project's state when it
 * fires, so creation validates this slug and the checker evaluates each
 * reminder only against its owner's visible projects.
 */
export function reminderProjectSlugs(r: {
  conditionType: string;
  conditionValue: string;
  projectSlug?: string | null;
}): string[] {
  const slugs = new Set<string>();
  if (r.projectSlug) slugs.add(r.projectSlug);
  if (r.conditionType === "project-health" || r.conditionType === "phase-complete") {
    const slug = r.conditionValue.split(":")[0];
    if (slug) slugs.add(slug);
  } else if (r.conditionType === "project-deployed" && r.conditionValue) {
    slugs.add(r.conditionValue);
  }
  return [...slugs];
}

/** True when every project the reminder names is in `projectWhere`. */
export async function reminderProjectsVisible(
  prisma: PrismaClient,
  projectWhere: Prisma.ProjectWhereInput,
  r: { conditionType: string; conditionValue: string; projectSlug?: string | null },
): Promise<boolean> {
  const slugs = reminderProjectSlugs(r);
  if (slugs.length === 0) return true;
  const count = await prisma.project.count({
    where: { AND: [{ slug: { in: slugs } }, projectWhere] },
  });
  return count === slugs.length;
}

export interface ReminderData {
  id: number;
  message: string;
  conditionType: string;
  conditionValue: string;
  projectSlug: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  triggeredAt: Date | null;
}

/**
 * Check all pending reminders against current project states.
 * Triggers reminders whose conditions are met.
 */
export async function checkReminders(
  prisma: PrismaClient
): Promise<{ triggered: number; reminders: ReminderData[] }> {
  const pending = await prisma.reminder.findMany({
    where: { status: "pending" },
  });

  if (pending.length === 0) {
    return { triggered: 0, reminders: [] };
  }

  // 66.2 — one project map per owner, built from what that owner can
  // see. Owner null = operator reminder (the non-demo fleet).
  type ProjectRow = Awaited<ReturnType<typeof prisma.project.findMany>>[number];
  const mapsByOwner = new Map<string, Map<string, ProjectRow>>();
  async function projectsFor(ownerUserId: string | null) {
    const key = ownerUserId ?? "";
    const cached = mapsByOwner.get(key);
    if (cached) return cached;
    const where: Prisma.ProjectWhereInput = ownerUserId
      ? await visibleProjectFilter(prisma, ownerUserId)
      : { isDemo: false };
    const rows = await prisma.project.findMany({ where });
    const map = new Map(rows.map((p) => [p.slug, p]));
    mapsByOwner.set(key, map);
    return map;
  }

  const triggered: ReminderData[] = [];

  for (const reminder of pending) {
    let conditionMet = false;
    const projectMap = await projectsFor(reminder.ownerUserId);

    switch (reminder.conditionType) {
      case "project-health": {
        // conditionValue format: "slug:health" e.g., "ratracer:healthy"
        const [slug, targetHealth] = reminder.conditionValue.split(":");
        const project = projectMap.get(slug);
        if (project && project.health === targetHealth) {
          conditionMet = true;
        }
        break;
      }

      case "phase-complete": {
        // conditionValue format: "slug:phase-N" e.g., "ratracer:phase-3"
        const [slug, targetPhase] = reminder.conditionValue.split(":");
        const project = projectMap.get(slug);
        if (project) {
          const currentNum = parseInt(
            project.currentPhase.match(/phase-(\d+)/)?.[1] || "0"
          );
          const targetNum = parseInt(
            targetPhase.match(/(\d+)/)?.[1] || "999"
          );
          if (currentNum > targetNum) {
            conditionMet = true;
          }
        }
        break;
      }

      case "project-deployed": {
        // conditionValue is the slug
        const project = projectMap.get(reminder.conditionValue);
        if (project && project.status === "deployed") {
          conditionMet = true;
        }
        break;
      }

      case "custom": {
        // Custom reminders are triggered manually or by Delamain
        // They stay pending until explicitly triggered
        break;
      }
    }

    if (conditionMet) {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "triggered", triggeredAt: new Date() },
      });
      triggered.push({ ...reminder, status: "triggered", triggeredAt: new Date() });
    }
  }

  return { triggered: triggered.length, reminders: triggered };
}

/**
 * Parse [REMINDER] tags from Delamain's responses.
 * Format: [REMINDER] condition_type:condition_value — message
 */
export function parseReminders(
  content: string
): { conditionType: string; conditionValue: string; message: string; projectSlug: string | null }[] {
  const reminders: {
    conditionType: string;
    conditionValue: string;
    message: string;
    projectSlug: string | null;
  }[] = [];

  const regex =
    /\[REMINDER\]\s*([\w-]+):([\w-:]+)\s*(?:—|-)\s*(.+)/gi;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const conditionType = match[1];
    const conditionValue = match[2];
    const message = match[3].trim();

    // Extract project slug from condition value if present
    const slugMatch = conditionValue.match(/^([\w-]+):/);
    const projectSlug = slugMatch ? slugMatch[1] : null;

    reminders.push({ conditionType, conditionValue, message, projectSlug });
  }

  return reminders;
}
