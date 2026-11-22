"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Phase 72 — ticket detail: edit title / description / priority /
 * assignee / milestone, or delete (two clicks, no browser confirm()).
 * The server enforces every scope rule (app/api/tickets); this mirrors
 * its fields. Escape and the Close button dismiss; focus starts on the
 * title field.
 */
export interface DialogTicket {
  id: string;
  title: string;
  description: string;
  priority: string;
  assigneeUserId?: string | null;
  milestoneId?: string | null;
}

const PRIORITIES = ["low", "normal", "high", "urgent"];

export function TicketDialog({
  ticket,
  assignees,
  onClose,
  onSaved,
}: {
  ticket: DialogTicket;
  /** People this board's tickets may be assigned to (owner / org members). */
  assignees: { userId: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description);
  const [priority, setPriority] = useState(ticket.priority);
  const [assignee, setAssignee] = useState(ticket.assigneeUserId ?? "");
  const [milestone, setMilestone] = useState(ticket.milestoneId ?? "");
  const [milestones, setMilestones] = useState<{ id: string; title: string }[]>(
    [],
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    let cancelled = false;
    fetch("/api/milestones")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.milestones))
          setMilestones(data.milestones);
      })
      .catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function send(
    method: "PATCH" | "DELETE",
    body: Record<string, unknown>,
  ) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data.error === "string" ? data.error : "That didn't save.",
        );
        return;
      }
      onSaved();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-dialog-title"
        className="w-full max-w-lg border border-space-600 bg-space-800 p-4 space-y-3"
      >
        <h2
          id="ticket-dialog-title"
          className="text-sm font-mono font-bold text-cyan uppercase tracking-wider"
        >
          Ticket
        </h2>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || busy) return;
            void send("PATCH", {
              id: ticket.id,
              title: title.trim(),
              description,
              priority,
              assigneeUserId: assignee || null,
              milestoneId: milestone || null,
            });
          }}
        >
          <div>
            <label
              htmlFor="ticket-title"
              className="block text-xs font-mono text-text-dim"
            >
              Title
            </label>
            <input
              id="ticket-title"
              ref={titleRef}
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              className="input w-full min-w-0"
            />
          </div>
          <div>
            <label
              htmlFor="ticket-description"
              className="block text-xs font-mono text-text-dim"
            >
              Description
            </label>
            <textarea
              id="ticket-description"
              value={description}
              maxLength={5000}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full min-w-0"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <label
                htmlFor="ticket-priority"
                className="block text-xs font-mono text-text-dim"
              >
                Priority
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="bg-space-900 border border-space-600 px-2 py-1 text-xs font-mono text-text"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="ticket-assignee"
                className="block text-xs font-mono text-text-dim"
              >
                Assignee
              </label>
              <select
                id="ticket-assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="bg-space-900 border border-space-600 px-2 py-1 text-xs font-mono text-text"
              >
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="ticket-milestone"
                className="block text-xs font-mono text-text-dim"
              >
                Milestone
              </label>
              <select
                id="ticket-milestone"
                value={milestone}
                onChange={(e) => setMilestone(e.target.value)}
                className="bg-space-900 border border-space-600 px-2 py-1 text-xs font-mono text-text"
              >
                <option value="">None</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs font-mono text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className="min-h-6 border border-cyan px-3 py-1.5 text-xs font-mono uppercase text-cyan hover:bg-cyan/10 disabled:opacity-50 focus-ring"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-6 border border-space-600 px-3 py-1.5 text-xs font-mono uppercase text-text-dim hover:text-text focus-ring"
            >
              Close
            </button>
            {confirmDelete ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("DELETE", { id: ticket.id })}
                className="ml-auto min-h-6 border border-danger px-3 py-1.5 text-xs font-mono uppercase text-danger hover:bg-danger/10 disabled:opacity-50 focus-ring"
              >
                Confirm delete
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="ml-auto min-h-6 px-3 py-1.5 text-xs font-mono uppercase text-danger underline focus-ring"
              >
                Delete
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
