"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 52.3 — dispatch this project to the cloud runner and watch the run
 * live: status, cost, and the agent's event stream. Renders nothing for
 * signed-out/local viewers (the API 401s) or repo-less projects.
 */

interface RunEvent {
  id: number;
  summary: string;
  createdAt: string;
}

interface RunState {
  dispatch: {
    id: string;
    status: string;
    mode: string;
    costUsd: number | null;
    errorMessage: string | null;
    resultBranch: string | null;
  };
  outcome: { outcome: string } | null;
  events: RunEvent[];
}

const MODES = ["audit", "continue", "investigate"];

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
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!runId) return;
    const poll = async () => {
      const res = await fetch(`/api/dispatch/cloud/${runId}`);
      if (!res.ok) return;
      const data: RunState = await res.json();
      setRun(data);
      if (
        ["completed", "failed"].includes(data.dispatch.status) &&
        timer.current
      ) {
        clearInterval(timer.current);
        timer.current = null;
      }
    };
    poll();
    timer.current = setInterval(poll, 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [runId]);

  if (!hasRepo || hidden) return null;

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
          onClick={async () => {
            setError(null);
            const res = await fetch("/api/dispatch/cloud", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug, mode }),
            });
            if (res.status === 401) {
              setHidden(true);
              return;
            }
            const data = await res.json();
            if (!res.ok) {
              setError(data.error ?? "Couldn't enqueue.");
              return;
            }
            setRun(null);
            setRunId(data.dispatch.id);
          }}
          className="border border-cyan px-3 py-1.5 text-xs font-mono uppercase text-cyan hover:bg-cyan/10"
        >
          Dispatch to cloud
        </button>
        {error && (
          <span role="alert" className="text-xs font-mono text-danger">
            {error}
          </span>
        )}
      </div>

      {run && (
        <div className="border border-space-600 bg-space-900 p-3">
          <p className="text-xs font-mono mb-2">
            <span
              className={
                run.dispatch.status === "completed"
                  ? "text-success"
                  : run.dispatch.status === "failed"
                    ? "text-danger"
                    : "text-amber"
              }
            >
              {run.dispatch.status.toUpperCase()}
            </span>
            <span className="text-text-dim">
              {" "}
              · {run.dispatch.mode}
              {run.dispatch.costUsd !== null &&
                ` · $${run.dispatch.costUsd.toFixed(3)}`}
              {run.outcome && ` · ${run.outcome.outcome}`}
            </span>
          </p>
          {run.dispatch.resultBranch && (
            <p className="text-xs font-mono text-success mb-2">
              Pushed branch: {run.dispatch.resultBranch}
            </p>
          )}
          {run.dispatch.errorMessage && (
            <p className="text-xs font-mono text-danger mb-2">
              {run.dispatch.errorMessage.slice(0, 200)}
            </p>
          )}
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {run.events.slice(-30).map((event) => (
              <li key={event.id} className="text-[11px] font-mono text-text">
                {event.summary}
              </li>
            ))}
            {run.events.length === 0 &&
              !["completed", "failed"].includes(run.dispatch.status) && (
                <li className="text-[11px] font-mono text-text-dim">
                  Waiting for the runner…
                </li>
              )}
          </ul>
        </div>
      )}
    </div>
  );
}
