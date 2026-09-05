/**
 * 54.4b — Linear → native board import.
 *
 * Idempotent by Ticket.linearIssueId (unique): first sync creates, later
 * syncs update title/description/column in place. fetchIssues is
 * injectable — production uses the Linear GraphQL API with the org's
 * sealed key; tests inject fixtures.
 */
import type { PrismaClient } from "@/app/generated/prisma/client";
import { positionAfter, DEFAULT_COLUMNS } from "./boards";

export interface LinearIssue {
  id: string;
  title: string;
  description: string;
  state: { type: string };
  priority: number;
}

/** Linear workflow-state types → our default column names. */
export function mapStateToColumn(
  stateType: string,
): (typeof DEFAULT_COLUMNS)[number] {
  switch (stateType) {
    case "started":
      return "In Progress";
    case "completed":
    case "canceled":
      return "Done";
    default: // unstarted, backlog, triage, unknown
      return "Todo";
  }
}

const LINEAR_PRIORITY: Record<number, string> = {
  0: "normal", // Linear: no priority
  1: "urgent",
  2: "high",
  3: "normal",
  4: "low",
};

export async function fetchLinearIssues(
  apiKey: string,
): Promise<LinearIssue[]> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({
      query: `query { issues(first: 100, orderBy: updatedAt) { nodes { id title description state { type } priority } } }`,
    }),
  });
  if (!res.ok) {
    throw new Error(`Linear API ${res.status}`);
  }
  const data = await res.json();
  const nodes = data?.data?.issues?.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error("Linear API returned an unexpected shape");
  }
  return nodes.map((n: Record<string, unknown>) => ({
    id: String(n.id),
    title: String(n.title ?? "Untitled"),
    description: typeof n.description === "string" ? n.description : "",
    state:
      typeof n.state === "object" && n.state !== null
        ? (n.state as { type: string })
        : { type: "unstarted" },
    priority: typeof n.priority === "number" ? n.priority : 0,
  }));
}

export async function syncLinearIssues(
  prisma: PrismaClient,
  args: {
    boardId: string;
    createdById: string;
    fetchIssues: () => Promise<LinearIssue[]>;
  },
): Promise<{ created: number; updated: number }> {
  const issues = await args.fetchIssues();
  const columns = await prisma.boardColumn.findMany({
    where: { boardId: args.boardId },
  });
  const columnByName = new Map(columns.map((c) => [c.name, c]));

  let created = 0;
  let updated = 0;
  for (const issue of issues) {
    const columnName = mapStateToColumn(issue.state.type);
    const column = columnByName.get(columnName) ?? columns[0];
    if (!column) continue;

    const existing = await prisma.ticket.findUnique({
      where: { linearIssueId: issue.id },
    });
    if (existing) {
      const needsMove = existing.columnId !== column.id;
      await prisma.ticket.update({
        where: { id: existing.id },
        data: {
          title: issue.title.slice(0, 200),
          description: issue.description.slice(0, 5000),
          priority: LINEAR_PRIORITY[issue.priority] ?? "normal",
          ...(needsMove ? { columnId: column.id } : {}),
        },
      });
      updated++;
      continue;
    }

    const last = await prisma.ticket.findFirst({
      where: { columnId: column.id },
      orderBy: { position: "desc" },
    });
    await prisma.ticket.create({
      data: {
        boardId: args.boardId,
        columnId: column.id,
        title: issue.title.slice(0, 200),
        description: issue.description.slice(0, 5000),
        priority: LINEAR_PRIORITY[issue.priority] ?? "normal",
        position: positionAfter(last?.position ?? null),
        createdById: args.createdById,
        linearIssueId: issue.id,
      },
    });
    created++;
  }
  return { created, updated };
}
