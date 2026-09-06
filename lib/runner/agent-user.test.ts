/** 52.7 [52.D1] — unprivileged agent user provisioning. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ensureAgentUser,
  AGENT_USER,
  __resetAgentUserCache,
} from "./agent-user";

beforeEach(() => __resetAgentUserCache());

function execOk(map: Record<string, string>) {
  return vi.fn(async (cmd: string, args: string[]) => {
    const key = `${cmd} ${args.join(" ")}`;
    for (const [pattern, stdout] of Object.entries(map)) {
      if (key.startsWith(pattern)) return { stdout };
    }
    throw new Error(`unexpected: ${key}`);
  });
}

describe("ensureAgentUser", () => {
  it("reuses an existing user without calling useradd", async () => {
    const exec = execOk({
      [`id -u ${AGENT_USER}`]: "1500\n",
      [`id -g ${AGENT_USER}`]: "1500\n",
    });
    const user = await ensureAgentUser(exec);
    expect(user).toEqual({
      uid: 1500,
      gid: 1500,
      home: `/home/${AGENT_USER}`,
    });
    expect(exec.mock.calls.some((c) => c[0] === "useradd")).toBe(false);
  });

  it("creates the user when missing, then resolves its ids", async () => {
    let created = false;
    const exec = vi.fn(async (cmd: string, args: string[]) => {
      if (cmd === "useradd") {
        created = true;
        return { stdout: "" };
      }
      if (cmd === "id" && !created) throw new Error("no such user");
      return { stdout: args[0] === "-u" ? "1500\n" : "1500\n" };
    });
    const user = await ensureAgentUser(exec);
    expect(created).toBe(true);
    expect(user?.uid).toBe(1500);
  });

  it("returns null when the platform cannot provision (degrades, never throws)", async () => {
    const exec = vi.fn(async () => {
      throw new Error("useradd: command not found");
    });
    await expect(ensureAgentUser(exec)).resolves.toBeNull();
  });

  it("returns null on a nonsense id (never spawns as uid 0)", async () => {
    const exec = execOk({
      [`id -u ${AGENT_USER}`]: "0\n",
      [`id -g ${AGENT_USER}`]: "0\n",
    });
    await expect(ensureAgentUser(exec)).resolves.toBeNull();
  });

  it("caches the result across calls", async () => {
    const exec = execOk({
      [`id -u ${AGENT_USER}`]: "1500\n",
      [`id -g ${AGENT_USER}`]: "1500\n",
    });
    await ensureAgentUser(exec);
    const callsAfterFirst = exec.mock.calls.length;
    await ensureAgentUser(exec);
    expect(exec.mock.calls.length).toBe(callsAfterFirst);
  });
});
