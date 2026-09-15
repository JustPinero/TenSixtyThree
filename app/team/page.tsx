import { OrgWorkspace } from "./org-workspace";

export const dynamic = "force-dynamic";

/**
 * Organizations (Phase 54.3 multi-org workspace). Signed-in viewers get
 * the full OrgWorkspace; local single-operator mode (no session, /api/orgs
 * 401s) gets a plain notice — the Phase 48 single-team fallback UI it used
 * to render was retired in the 1.0 cleanup along with /api/team.
 */
export default function TeamPage() {
  return (
    <OrgWorkspace>
      <main className="p-8 max-w-2xl">
        <h1 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider mb-2">
          Organizations
        </h1>
        <p className="text-sm font-mono text-space-500">
          Organizations, shared projects, and the team feed are hosted
          features. Sign in to use them — local single-operator mode runs
          without an account.
        </p>
      </main>
    </OrgWorkspace>
  );
}
