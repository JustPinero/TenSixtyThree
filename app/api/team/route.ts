import { prisma } from "@/lib/db";
import { createTeam, listMembers } from "@/lib/teams";
import { listTeamActivity } from "@/lib/team-activity";

/**
 * Phase 48.3 — first UI wiring for the Teams foundation (43.1/45.1).
 * Single-operator shape for now: one team, the operator is the owner.
 * GET  → the team (or null), its members, and the unified activity feed.
 * POST → create the team + local operator user in one step.
 */
export async function GET(): Promise<Response> {
  const team = await prisma.team.findFirst({ orderBy: { id: "asc" } });
  if (!team) return Response.json({ team: null, members: [], activity: [] });
  const [members, activity] = await Promise.all([
    listMembers(prisma, team),
    listTeamActivity(prisma, team),
  ]);
  return Response.json({ team, members, activity });
}

export async function POST(req: Request): Promise<Response> {
  let body: { name?: string; operatorEmail?: string; operatorName?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = body.name?.trim();
  const email = body.operatorEmail?.trim();
  const operatorName = body.operatorName?.trim() || "Operator";
  if (!name || !email) {
    return Response.json(
      { error: "name and operatorEmail are required" },
      { status: 400 },
    );
  }
  const existing = await prisma.team.findFirst();
  if (existing) {
    return Response.json(
      { error: `A team already exists: ${existing.name}` },
      { status: 409 },
    );
  }
  const owner = await prisma.user.upsert({
    where: { email },
    update: { name: operatorName },
    create: { email, name: operatorName },
  });
  const team = await createTeam(prisma, { name, owner });
  return Response.json({ team });
}
