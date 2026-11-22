"use client";

import Link from "next/link";
import { useState } from "react";
import { useDeploymentMode } from "./deployment-mode";

/**
 * Phase 68.2 — what a brand-new account sees instead of an empty grid:
 * connect a repo, join an org, or talk to the assistant. Local installs
 * get the local equivalents (scan the projects folder, create a project).
 */
export function FirstRunPanel({ onConnected }: { onConnected?: () => void }) {
  const mode = useDeploymentMode();
  const [repo, setRepo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === "local") {
    return (
      <div className="p-8 border border-space-600 bg-space-800 glow-border text-center">
        <p className="text-sm text-text font-mono">
          No projects yet. Use <strong>Scan</strong> to import the repos in your
          projects folder, or{" "}
          <Link href="/create" className="text-cyan underline focus-ring">
            create a project
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="first-run"
      className="p-6 border border-space-600 bg-space-800 glow-border"
    >
      <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider">
        Get started
      </h2>
      <div className="mt-4 grid gap-6 md:grid-cols-3">
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!repo.trim() || busy) return;
            setBusy(true);
            setError(null);
            try {
              const res = await fetch("/api/projects/connect", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ githubRepo: repo.trim() }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                setError(
                  typeof data.error === "string"
                    ? data.error
                    : "Couldn't connect that repo.",
                );
                return;
              }
              setRepo("");
              onConnected?.();
            } catch {
              setError("Network error. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3 className="text-xs font-mono font-bold text-text-bright uppercase">
            Connect a GitHub repo
          </h3>
          <label
            htmlFor="connect-repo"
            className="block text-xs font-mono text-text-dim"
          >
            owner/repo or its URL
          </label>
          <input
            id="connect-repo"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="acme/website"
            className="input w-full min-w-0"
          />
          <button
            type="submit"
            disabled={busy || !repo.trim()}
            className="min-h-6 border border-cyan px-3 py-1.5 text-xs font-mono uppercase text-cyan hover:bg-cyan/10 disabled:opacity-50 focus-ring"
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
          {error && (
            <p role="alert" className="text-xs font-mono text-danger">
              {error}
            </p>
          )}
        </form>
        <div className="space-y-2">
          <h3 className="text-xs font-mono font-bold text-text-bright uppercase">
            Join an org
          </h3>
          <p className="text-xs font-mono text-text">
            Projects shared into an organization appear here once you&apos;re a
            member. Ask an admin to invite you, then check{" "}
            <Link href="/team" className="text-cyan underline focus-ring">
              Team
            </Link>
            .
          </p>
        </div>
        <div className="space-y-2">
          <h3 className="text-xs font-mono font-bold text-text-bright uppercase">
            Talk to the assistant
          </h3>
          <p className="text-xs font-mono text-text">
            Ask what it can do, or have it help plan your first project.{" "}
            <Link href="/delamain" className="text-cyan underline focus-ring">
              Open the chat
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
