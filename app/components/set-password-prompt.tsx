"use client";

import { useEffect, useState } from "react";

/**
 * 54.1 — after an invited user's first email-code sign-in they have no
 * credential account; this banner prompts them to create a password.
 * Renders nothing when signed out (401), already passworded, or dismissed
 * for the session.
 */
export function SetPasswordPrompt() {
  const [show, setShow] = useState(false);
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/password")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && data.hasPassword === false) setShow(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show || state === "done") return null;

  return (
    <div className="border-b border-amber/40 bg-space-800 px-4 py-2 flex flex-wrap items-center gap-3">
      <p className="text-xs font-mono text-amber">
        Secure your account: create a password (email codes keep working too).
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setState("saving");
          const res = await fetch("/api/account/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newPassword: password }),
          });
          setState(res.ok ? "done" : "error");
        }}
        className="flex items-center gap-2"
      >
        <label className="sr-only" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="bg-space-900 border border-space-600 px-2 py-1 text-xs font-mono text-text-bright"
        />
        <button
          type="submit"
          disabled={state === "saving" || password.length < 8}
          className="border border-amber px-2 py-1 text-xs font-mono uppercase text-amber disabled:opacity-50"
        >
          {state === "saving" ? "Saving..." : "Set password"}
        </button>
      </form>
      {state === "error" && (
        <span role="alert" className="text-xs font-mono text-danger">
          Couldn&apos;t save — try again.
        </span>
      )}
      <button
        onClick={() => setShow(false)}
        aria-label="Dismiss password prompt"
        className="ml-auto text-xs font-mono text-text-dim hover:text-text"
      >
        Later
      </button>
    </div>
  );
}
