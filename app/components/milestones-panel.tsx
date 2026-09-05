"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 54.4 — roadmap milestones (personal + active org). Hidden when signed
 * out / local mode (the API 401s). Status cycles planned → in_progress
 * → shipped on click.
 */

interface Milestone {
  id: string;
  title: string;
  description: string;
  status: string;
  targetDate: string | null;
  organizationId: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  planned: { label: "Planned", cls: "text-text-dim border-space-600" },
  in_progress: { label: "In progress", cls: "text-amber border-amber" },
  shipped: { label: "Shipped", cls: "text-success border-success" },
};
const NEXT_STATUS: Record<string, string> = {
  planned: "in_progress",
  in_progress: "shipped",
  shipped: "planned",
};

export function MilestonesPanel() {
  const [milestones, setMilestones] = useState<Milestone[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/milestones");
      if (!res.ok) {
        setHidden(true);
        return;
      }
      setMilestones((await res.json()).milestones);
    } catch {
      setHidden(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hidden || milestones === null) return null;

  return (
    <section id="tour-milestones" className="mb-8">
      <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider mb-3">
        Milestones
      </h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          await fetch("/api/milestones", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: draft.trim(), scope: "personal" }),
          });
          setDraft("");
          refresh();
        }}
        className="flex gap-2 mb-3"
      >
        <label htmlFor="new-milestone" className="sr-only">
          New milestone
        </label>
        <input
          id="new-milestone"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New milestone…"
          className="bg-space-900 border border-space-600 px-2 py-1.5 text-sm font-mono text-text-bright"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="border border-cyan px-2 py-1.5 text-xs font-mono uppercase text-cyan disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {milestones.length === 0 ? (
        <p className="text-xs font-mono text-text-dim">
          No milestones yet — define where this is all going.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {milestones.map((m) => {
            const meta = STATUS_META[m.status] ?? STATUS_META.planned;
            return (
              <li key={m.id}>
                <button
                  onClick={async () => {
                    await fetch("/api/milestones", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        id: m.id,
                        status: NEXT_STATUS[m.status] ?? "planned",
                      }),
                    });
                    refresh();
                  }}
                  title={`${m.title} — click to advance status`}
                  className={`border px-3 py-1.5 text-xs font-mono ${meta.cls} bg-space-800 hover:border-cyan`}
                >
                  <span className="text-text-bright">{m.title}</span>{" "}
                  <span className="uppercase tracking-wider">{meta.label}</span>
                  {m.organizationId && (
                    <span className="ml-1 text-info">org</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
