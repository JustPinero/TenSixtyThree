"use client";

import { useEffect, useState } from "react";

/**
 * Phase 46.1 — visible warning when malformed webhook pings have been
 * quarantined (previously silent loss). Renders nothing when clean.
 */
export function QuarantineBanner() {
  const [status, setStatus] = useState<{ count: number; path: string } | null>(
    null
  );

  useEffect(() => {
    fetch("/api/observability/quarantine")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (!status || status.count === 0) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-center gap-2 border border-amber-500/60 bg-amber-500/10 p-3 text-sm font-mono text-amber-400"
    >
      <span aria-hidden="true">⚠</span>
      <span>
        {status.count} malformed webhook ping{status.count === 1 ? "" : "s"}{" "}
        quarantined — session completions may be missing. Inspect{" "}
        <code className="text-amber-300">{status.path}</code>
      </span>
    </div>
  );
}
