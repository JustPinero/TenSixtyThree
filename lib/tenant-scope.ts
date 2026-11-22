/**
 * Phase 66 — tenant scoping for everything that is not a Project row.
 *
 * `lib/project-access.ts` answers "which projects can this viewer see".
 * This module carries that answer (plus who is asking) into the rows
 * that hang off projects — activity, tasks, reminders, outcomes,
 * lessons — and into the Overseer's tools, so a route or a tool can't
 * forget the filter: it asks for `taskWhere(scope)` instead of `{}`.
 *
 * Operator = the local single-user operator or a hosted site admin.
 * Only operators see fleet-level rows that belong to no project and no
 * user (cross-project activity, operator tasks/reminders, lessons with
 * no source project, tool-call stats, the playbook, the engineer channel).
 */
import type { PrismaClient, Prisma } from "@/app/generated/prisma/client";
import { visibleProjectFilter } from "@/lib/project-access";

export interface TenantScope {
  /** The acting user; null = the local operator (or nobody, for DENY). */
  userId: string | null;
  isOperator: boolean;
  isDemo: boolean;
  /** Which projects this viewer can see (the 55.2 matrix). */
  projectWhere: Prisma.ProjectWhereInput;
}

/** The subset of lib/access `Viewer` the scope needs (tests build it bare). */
export type ScopeViewer =
  | { kind: "local" }
  | { kind: "user"; userId: string; isAdmin: boolean; isDemo: boolean };

const NOTHING: Prisma.ProjectWhereInput = { id: { in: [] } };

export const DENY_SCOPE: TenantScope = Object.freeze({
  userId: null,
  isOperator: false,
  isDemo: false,
  projectWhere: NOTHING,
});

export const LOCAL_SCOPE: TenantScope = Object.freeze({
  userId: null,
  isOperator: true,
  isDemo: false,
  projectWhere: { isDemo: false },
});

export async function scopeForViewer(
  prisma: PrismaClient,
  viewer: ScopeViewer,
): Promise<TenantScope> {
  if (viewer.kind === "local") return LOCAL_SCOPE;
  return {
    userId: viewer.userId,
    isOperator: viewer.isAdmin && !viewer.isDemo,
    isDemo: viewer.isDemo,
    projectWhere: await visibleProjectFilter(prisma, viewer.userId),
  };
}

/**
 * Tool-context default. A context built without a scope is the local
 * operator only when the app runs locally; on the hosted app it sees
 * nothing — a forgotten scope must fail closed.
 */
export function scopeOf(ctx: { scope?: TenantScope }): TenantScope {
  if (ctx.scope) return ctx.scope;
  return process.env.AUTH_REQUIRED === "true" ? DENY_SCOPE : LOCAL_SCOPE;
}

function denied(scope: TenantScope): boolean {
  return scope === DENY_SCOPE;
}

export function activityWhere(
  scope: TenantScope,
): Prisma.ActivityEventWhereInput {
  if (denied(scope)) return { id: { in: [] } };
  const or: Prisma.ActivityEventWhereInput[] = [
    { project: { is: scope.projectWhere } },
  ];
  if (scope.isOperator) or.push({ projectId: null });
  return { OR: or };
}

export function taskWhere(scope: TenantScope): Prisma.HumanTaskWhereInput {
  if (denied(scope)) return { id: { in: [] } };
  const or: Prisma.HumanTaskWhereInput[] = [
    { project: { is: scope.projectWhere } },
  ];
  if (scope.userId) or.push({ ownerUserId: scope.userId, projectId: null });
  if (scope.isOperator) or.push({ projectId: null, ownerUserId: null });
  return { OR: or };
}

export function reminderWhere(scope: TenantScope): Prisma.ReminderWhereInput {
  if (denied(scope)) return { id: { in: [] } };
  if (scope.userId) {
    return scope.isOperator
      ? { OR: [{ ownerUserId: scope.userId }, { ownerUserId: null }] }
      : { ownerUserId: scope.userId };
  }
  return scope.isOperator ? { ownerUserId: null } : { id: { in: [] } };
}

export function outcomeWhere(
  scope: TenantScope,
): Prisma.DispatchOutcomeWhereInput {
  if (denied(scope)) return { id: { in: [] } };
  return { project: scope.projectWhere };
}

export function lessonWhere(
  scope: TenantScope,
): Prisma.KnowledgeLessonWhereInput {
  if (denied(scope)) return { id: { in: [] } };
  const or: Prisma.KnowledgeLessonWhereInput[] = [
    { sourceProject: { is: scope.projectWhere } },
  ];
  if (scope.isOperator) or.push({ sourceProjectId: null });
  return { OR: or };
}
