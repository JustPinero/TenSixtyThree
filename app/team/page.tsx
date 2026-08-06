import { prisma } from "@/lib/db";
import { listMembers } from "@/lib/teams";
import { listTeamActivity } from "@/lib/team-activity";
import { TeamSetupForm, InviteForm } from "./team-forms";

export const dynamic = "force-dynamic";

/**
 * Phase 48.3 — the Teams foundation gets a face. Single-team view: members,
 * invites, and the unified activity feed (the collision-plane primitive:
 * human tasks and agent dispatches in one owner-attributed stream).
 */
export default async function TeamPage() {
  const team = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });

  if (!team) {
    return (
      <main className="p-8 max-w-2xl">
        <h1 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider mb-2">
          Team
        </h1>
        <p className="text-sm font-mono text-space-500 mb-6">
          No team yet. Create one to start attributing work — human tasks and
          agent dispatches — to people on a shared board.
        </p>
        <TeamSetupForm />
      </main>
    );
  }

  const [members, activity] = await Promise.all([
    listMembers(prisma, team),
    listTeamActivity(prisma, team),
  ]);

  return (
    <main className="p-8 max-w-4xl">
      <h1 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider mb-1">
        {team.name}
      </h1>
      <p className="text-xs font-mono text-space-500 mb-6">
        {members.length} member{members.length === 1 ? "" : "s"} · unified
        activity feed (humans + agents)
      </p>

      <section className="mb-8">
        <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider mb-3">
          Members
        </h2>
        <ul className="space-y-1">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between p-2 border border-space-600 bg-space-800 text-sm font-mono"
            >
              <span className="text-text-bright">
                {m.user?.name ?? "Unknown"}{" "}
                <span className="text-space-500">{m.user?.email}</span>
              </span>
              <span className="text-xs uppercase text-space-500">{m.role}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <InviteForm />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider mb-3">
          Activity
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm font-mono text-space-500">
            Nothing attributed to this team yet. Dispatches and tasks assigned
            to the team will appear here, newest first.
          </p>
        ) : (
          <ul className="space-y-1">
            {activity.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between p-2 border border-space-600 bg-space-800 text-sm font-mono"
              >
                <span className="text-text-bright">
                  <span
                    className={
                      item.kind === "dispatch"
                        ? "text-cyan mr-2"
                        : "text-amber-400 mr-2"
                    }
                  >
                    {item.kind === "dispatch" ? "🤖" : "👤"}
                  </span>
                  {item.title}
                </span>
                <span className="text-xs text-space-500">
                  {item.owner?.name ?? "unassigned"} · {item.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
