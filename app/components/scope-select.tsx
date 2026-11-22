"use client";

import { useEffect, useState } from "react";

/**
 * Phase 68.4 — boards and milestones can belong to the active org, not
 * only to you (which is also what makes Linear sync reachable: it imports
 * into org boards). The picker only appears when you have an active org.
 */
export type Scope = "personal" | "org";

export function useActiveOrg(): { id: string; name: string } | null {
  const [org, setOrg] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/orgs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.orgs)) return;
        const active = data.orgs.find(
          (o: { id: string; name: string }) =>
            o.id === data.activeOrganizationId,
        );
        if (active) setOrg({ id: active.id, name: active.name });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return org;
}

export function ScopeSelect({
  id,
  value,
  onChange,
  orgName,
}: {
  id: string;
  value: Scope;
  onChange: (scope: Scope) => void;
  orgName: string;
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Belongs to
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) =>
          onChange(e.target.value === "org" ? "org" : "personal")
        }
        className="bg-space-900 border border-space-600 px-2 py-1.5 text-xs font-mono text-text"
      >
        <option value="personal">Just me</option>
        <option value="org">{orgName}</option>
      </select>
    </>
  );
}
