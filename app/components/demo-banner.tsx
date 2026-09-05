"use client";

import { useEffect, useState } from "react";

/** 54.5 — persistent marker for demo sessions. */
export function DemoBanner() {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.demo) setDemo(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!demo) return null;

  return (
    <div className="border-b border-cyan/40 bg-space-800 px-4 py-1.5 flex items-center gap-3">
      <p className="text-xs font-mono text-cyan">
        DEMO MODE — a sandbox fleet on scripted assistants. Nothing here is
        real, everything resets.
      </p>
      <a
        href="/signin"
        className="ml-auto text-xs font-mono text-text-dim hover:text-text underline"
      >
        Exit demo
      </a>
    </div>
  );
}
