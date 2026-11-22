"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Phase 68.4 — who is in the active org, who has been invited, and (for
 * owners/admins) role changes, removal and invite revocation. The server
 * enforces every rule (app/api/orgs/members); this only reflects them.
 */
interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}
interface InviteRow {
  id: string;
  email: string;
  role: string | null;
  expiresAt: string;
}
interface MembersBody {
  members: MemberRow[];
  invitations: InviteRow[];
  canManage: boolean;
  myRole: string;
}

const ROLES = ["owner", "admin", "member"];

export function MembersPanel({
  orgId,
  refreshKey = 0,
}: {
  orgId: string;
  refreshKey?: number;
}) {
  const [data, setData] = useState<MembersBody | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/orgs/members");
      if (!res.ok) {
        setError("Couldn't load members.");
        return;
      }
      // Don't clear `error` here: act() reloads after a refused change and
      // the refusal must stay visible.
      const body = (await res.json()) as Partial<MembersBody>;
      if (!Array.isArray(body.members) || !Array.isArray(body.invitations)) {
        setError("Couldn't load members.");
        return;
      }
      setData({
        members: body.members,
        invitations: body.invitations,
        canManage: body.canManage === true,
        myRole: body.myRole ?? "member",
      });
    } catch {
      setError("Couldn't load members.");
    }
  }, []);

  useEffect(() => {
    // Reload whenever the active org changes or an invite is sent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, orgId, refreshKey]);

  async function act(method: "PATCH" | "DELETE", url: string, body: unknown) {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(
        typeof payload.error === "string" ? payload.error : "That didn't work.",
      );
    }
    await load();
  }

  if (!data) {
    return error ? (
      <p role="alert" className="text-xs font-mono text-danger mb-6">
        {error}
      </p>
    ) : null;
  }

  return (
    <section
      aria-labelledby="members-heading"
      className="mb-6 border border-space-600 bg-space-800 p-4"
    >
      <h2
        id="members-heading"
        className="text-sm font-mono font-bold text-cyan uppercase tracking-wider mb-3"
      >
        Members
      </h2>
      <ul className="space-y-2">
        {data.members.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center gap-2 text-xs font-mono"
          >
            <span className="text-text-bright">{m.name}</span>
            <span className="text-text-dim break-all">{m.email}</span>
            {data.canManage ? (
              <>
                <label htmlFor={`role-${m.id}`} className="sr-only">
                  Role for {m.email}
                </label>
                <select
                  id={`role-${m.id}`}
                  value={m.role}
                  onChange={(e) =>
                    void act("PATCH", "/api/orgs/members", {
                      memberId: m.id,
                      role: e.target.value,
                    })
                  }
                  className="bg-space-900 border border-space-600 px-1 py-0.5 text-text"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    void act("DELETE", "/api/orgs/members", { memberId: m.id })
                  }
                  className="min-h-6 text-danger underline focus-ring"
                  aria-label={`Remove ${m.email}`}
                >
                  Remove
                </button>
              </>
            ) : (
              <span className="text-text">({m.role})</span>
            )}
          </li>
        ))}
      </ul>

      <h3 className="mt-4 text-xs font-mono font-bold text-text-dim uppercase tracking-wider">
        Pending invitations
      </h3>
      {data.invitations.length === 0 ? (
        <p className="mt-1 text-xs font-mono text-text-dim">None.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {data.invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center gap-2 text-xs font-mono"
            >
              <span className="text-text break-all">{inv.email}</span>
              <span className="text-text-dim">({inv.role ?? "member"})</span>
              {data.canManage && (
                <button
                  type="button"
                  onClick={() =>
                    void act("DELETE", "/api/orgs/invite", {
                      invitationId: inv.id,
                    })
                  }
                  className="min-h-6 text-danger underline focus-ring"
                  aria-label={`Revoke invitation for ${inv.email}`}
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs font-mono text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
