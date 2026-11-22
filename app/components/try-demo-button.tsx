"use client";

import { useState } from "react";

/** 54.5 / 68.1 — starts a demo session (used by /welcome and /signin). */
export function TryDemoButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/demo", { method: "POST" });
            if (res.ok) window.location.href = "/?demo=1";
            else setError("The demo is busy right now. Try again in a bit.");
          } catch {
            setError("Network error. Try again.");
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        className={
          className ??
          "w-full border border-amber px-4 py-2.5 text-sm font-mono uppercase text-amber hover:bg-space-800 disabled:opacity-50 focus-ring"
        }
      >
        {busy ? "Starting the demo…" : "Try the demo"}
      </button>
      {error && (
        <p role="alert" className="text-xs font-mono text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
