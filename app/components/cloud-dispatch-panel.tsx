"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 52.3 — dispatch this project to the cloud runner and watch the run
 * live: status, cost, and the agent's event stream. Renders nothing for
 * signed-out/local viewers (the API 401s) or repo-less projects.
 *
 * 67.4 — run history comes from the server, so it survives navigation;
 * an active run in that history is followed again after a remount.
 * Polling stops on every terminal state and while the tab is hidden.
 * A queued or running job can be cancelled.
 */

interface RunEvent {
  id: number;
  summary: string;
  createdAt: string;
}

interface RunSummary {
  id: string;
  status: string;
  mode: string;
  costUsd: number | null;
  errorMessage: string | null;
  resultBranch: string | null;
  resultPrUrl: string | null;
  enqueuedAt?: string;
  attempts?: number;
  cancelRequested?: boolean;
}

interface RunState {
  dispatch: RunSummary;
  outcome: { outcome: string } | null;
  events: RunEvent[];
}

const MODES = ["audit", "continue", "investigate"];
const TERMINAL = new Set(["completed", "failed", "timeout"]);
const ACTIVE = new Set(["queued", "started"]);
const POLL_MS = 5000;

function statusClass(status: string): string {
  if (status === "completed") return "text-success";
  if (status === "failed" || status === "timeout") return "text-danger";
  return "text-amber";
}

function RunLine({ run }: { run: RunSummary }) {
  return (
    <>
      <p className="text-xs font-mono">
        <span className={statusClass(run.status)}>
          {run.status.toUpperCase()}
        </span>
        <span className="text-text-dim">
          {" "}
          · {run.mode}
          {run.costUsd !== null && ` · $${run.costUsd.toFixed(3)}`}
          {run.attempts && run.attempts > 1 ? ` · attempt ${run.attempts}` : ""}
        </span>
      </p>
      {run.resultBranch && (
        <p className="text-xs font-mono text-success break-all">
          Branch: {run.resultBranch}
          {run.resultPrUrl && (
            <>
              {" · "}
              <a
                href={run.resultPrUrl}
                target="_blank"
                rel="noreferrer"
                className="text-info underline"
              >
                review the pull request
              </a>
            </>
          )}
        </p>
      )}
      {run.errorMessage && (
        <p className="text-xs font-mono text-danger">
          {run.errorMessage.slice(0, 200)}
        </p>
      )}
    </>
  );
}

export function CloudDispatchPanel({
  slug,
  hasRepo,
}: {
  slug: string;
  hasRepo: boolean;
}) {
  const [mode, setMode] = useState("audit");
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const loadHistory = useCallback(
    async (followActive: boolean) => {
      try {
        const res = await fetch(
          `/api/dispatch/cloud?projectSlug=${encodeURIComponent(slug)}`,
        );
        if (res.status === 401) {
          setHidden(true);
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        const runs: RunSummary[] = Array.isArray(data?.runs) ? data.runs : [];
        setHistory(runs);
        if (followActive) {
          const active = runs.find((r) => ACTIVE.has(r.status));
          if (active) setRunId((current) => current ?? active.id);
        }
      } catch {
        // history is a convenience; the dispatch button still works
      }
    },
    [slug],
  );

  useEffect(() => {
    if (!hasRepo) return;
    // Fetch-on-mount is the point (history survives navigation).
     
    void loadHistory(true);
  }, [hasRepo, loadHistory]);

  useEffect(() => {
    if (!runId) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const poll = async () => {
      const res = await fetch(`/api/dispatch/cloud/${runId}`);
      if (!res.ok) return;
      const data: RunState = await res.json();
      setRun(data);
      if (TERMINAL.has(data.dispatch.status)) {
        done = true;
        stopTimer();
        void loadHistory(false);
      }
    };
    const startTimer = () => {
      if (done || timer || document.hidden) return;
      timer = setInterval(() => void poll(), POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) stopTimer();
      else if (!done) {
        void poll();
        startTimer();
      }
    };
    void poll();
    startTimer();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runId, loadHistory]);

  if (!hasRepo || hidden) return null;

  // 65.4 — one active run per project: no second click while one is
  // being enqueued or is still queued/started.
  const runActive =
    runId !== null && (run === null || ACTIVE.has(run.dispatch.status));
  const disabled = submitting || runActive;
  const past = history.filter((h) => h.id !== run?.dispatch.id);

  return (
    <div className="mb-6 p-4 border border-space-600 bg-space-800">
      <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider mb-1">
        Cloud Dispatch
      </h2>
      <p className="text-xs font-mono text-text-dim mb-3">
        Runs on the hosted runner — clones the repo, executes a Claude session,
        reports outcome and cost here.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label htmlFor="cloud-mode" className="sr-only">
          Mode
        </label>
        <select
          id="cloud-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="bg-space-900 border border-space-600 px-2 py-1.5 text-xs font-mono text-text"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled}
          aria-busy={submitting}
          onClick={async () => {
            if (disabled) return;
            setError(null);
            setSubmitting(true);
            try {
              const res = await fetch("/api/dispatch/cloud", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug, mode }),
              });
              if (res.status === 401) {
                setHidden(true);
                return;
              }
              const data = await res.json().catch(() => ({}));
              if (res.status === 409 && typeof data.dispatchId === "string") {
                // Already running — follow that run instead of erroring.
                setRun(null);
                setRunId(data.dispatchId);
                return;
              }
              if (!res.ok) {
                setError(data.error ?? "Couldn't enqueue.");
                return;
              }
              setRun(null);
              setRunId(data.dispatch.id);
            } catch {
              setError("Network error — try again.");
            } finally {
              setSubmitting(false);
            }
          }}
          className="border border-cyan px-3 py-1.5 text-xs font-mono uppercase text-cyan hover:bg-cyan/10 disabled:opacity-50 disabled:cursor-not-allowed focus-ring"
        >
          {submitting
            ? "Dispatching…"
            : runActive
              ? "Run in progress"
              : "Dispatch to cloud"}
        </button>
        {runActive && runId && (
          <button
            type="button"
            disabled={cancelling || run?.dispatch.cancelRequested === true}
            onClick={async () => {
              setCancelling(true);
              try {
                const res = await fetch(`/api/dispatch/cloud/${runId}/cancel`, {
                  method: "POST",
                });
                if (!res.ok) setError("Couldn't cancel.");
              } catch {
                setError("Network error — try again.");
              } finally {
                setCancelling(false);
              }
            }}
            className="min-h-6 border border-danger px-3 py-1.5 text-xs font-mono uppercase text-danger hover:bg-danger/10 disabled:opacity-50 focus-ring"
          >
            {run?.dispatch.cancelRequested ? "Cancelling…" : "Cancel run"}
          </button>
        )}
        {error && (
          <span role="alert" className="text-xs font-mono text-danger">
            {error}
          </span>
        )}
      </div>

      {run && (
        <div className="border border-space-600 bg-space-900 p-3 mb-3">
          <RunLine run={run.dispatch} />
          {run.outcome && (
            <p className="text-micro font-mono text-text-dim mb-2">
              outcome: {run.outcome.outcome}
            </p>
          )}
          <ul className="space-y-1 max-h-48 overflow-y-auto mt-2">
            {run.events.slice(-30).map((event) => (
              <li key={event.id} className="text-micro font-mono text-text">
                {event.summary}
              </li>
            ))}
            {run.events.length === 0 && !TERMINAL.has(run.dispatch.status) && (
              <li className="text-micro font-mono text-text-dim">
                Waiting for the runner…
              </li>
            )}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="text-xs font-mono font-bold text-text-dim uppercase tracking-wider mb-2">
            Cloud runs
          </h3>
          <ul className="space-y-2">
            {past.map((h) => (
              <li key={h.id} className="border-l-2 border-space-600 pl-2">
                <RunLine run={h} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
