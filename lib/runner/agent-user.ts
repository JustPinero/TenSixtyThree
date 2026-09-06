/**
 * 52.7 — the unprivileged user the agent subprocess runs as ([52.D1]).
 *
 * The runner is root inside its container, so a same-uid agent could read
 * /proc/<runner-pid>/environ and lift GITHUB_TOKEN / DATABASE_URL despite
 * the allowlisted subprocess env. Dropping the CLI to its own uid closes
 * that: /proc environ of a root process is unreadable to another uid.
 *
 * Degrades rather than breaks: if the platform can't provision the user
 * (no useradd, non-root, non-Linux dev box), callers get null and fall
 * back to the previous same-uid posture with a warning.
 */

export const AGENT_USER = "tsagent";
const AGENT_UID = 1500;

export interface AgentUser {
  uid: number;
  gid: number;
  home: string;
}

export type ExecFn = (
  command: string,
  args: string[],
) => Promise<{ stdout: string }>;

let cached: AgentUser | null | undefined;

async function idOf(exec: ExecFn, flag: "-u" | "-g"): Promise<number> {
  const { stdout } = await exec("id", [flag, AGENT_USER]);
  return Number(stdout.trim());
}

export async function ensureAgentUser(exec: ExecFn): Promise<AgentUser | null> {
  if (cached !== undefined) return cached;
  try {
    try {
      await exec("id", ["-u", AGENT_USER]);
    } catch {
      await exec("useradd", [
        "-m",
        "-u",
        String(AGENT_UID),
        "-s",
        "/bin/sh",
        AGENT_USER,
      ]);
    }
    const uid = await idOf(exec, "-u");
    const gid = await idOf(exec, "-g");
    // Never "drop" to root — that would be a silent no-op.
    if (!Number.isInteger(uid) || uid <= 0 || !Number.isInteger(gid)) {
      cached = null;
      return cached;
    }
    cached = { uid, gid, home: `/home/${AGENT_USER}` };
    return cached;
  } catch {
    cached = null;
    return cached;
  }
}

/** Test seam — provisioning is cached for the process lifetime. */
export function __resetAgentUserCache(): void {
  cached = undefined;
}
