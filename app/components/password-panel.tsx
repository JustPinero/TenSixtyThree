"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Phase 68.3 — Settings → Password (the account menu links here as
 * /settings#password). Set a first password (server-side setPassword) or
 * change an existing one (Better Auth changePassword, which needs the
 * current one). Hidden for the local operator and demo sessions.
 */
export function PasswordPanel() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.user && !data.user.isDemo)
          setHasPassword(data.hasPassword === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (hasPassword === null) return null;

  return (
    <div id="password" className="mb-8 scroll-mt-20">
      <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider mb-1">
        Password
      </h2>
      <p className="text-xs font-mono text-text-dim mb-3">
        {hasPassword
          ? "Change the password you sign in with. Email codes keep working."
          : "Add a password so you can sign in without an email code."}
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setStatus("saving");
          setMessage(null);
          try {
            if (hasPassword) {
              const { error } = await authClient.changePassword({
                currentPassword: current,
                newPassword: next,
                revokeOtherSessions: true,
              });
              if (error)
                throw new Error(
                  error.message ?? "Couldn't change the password.",
                );
            } else {
              const res = await fetch("/api/account/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newPassword: next }),
              });
              if (!res.ok) throw new Error("Couldn't save the password.");
              setHasPassword(true);
            }
            setStatus("saved");
            setCurrent("");
            setNext("");
          } catch (err) {
            setStatus("error");
            setMessage(
              err instanceof Error
                ? err.message
                : "Couldn't save the password.",
            );
          }
        }}
      >
        {hasPassword && (
          <div className="min-w-0">
            <label
              htmlFor="current-password"
              className="block text-xs font-mono text-text-dim"
            >
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className="input min-w-0"
            />
          </div>
        )}
        <div className="min-w-0">
          <label
            htmlFor="settings-new-password"
            className="block text-xs font-mono text-text-dim"
          >
            New password
          </label>
          <input
            id="settings-new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="At least 8 characters"
            className="input min-w-0"
          />
        </div>
        <button
          type="submit"
          disabled={
            status === "saving" || next.length < 8 || (hasPassword && !current)
          }
          className="min-h-6 border border-cyan px-3 py-1.5 text-xs font-mono uppercase text-cyan hover:bg-cyan/10 disabled:opacity-50 focus-ring"
        >
          {status === "saving"
            ? "Saving…"
            : hasPassword
              ? "Change password"
              : "Set password"}
        </button>
        {status === "saved" && (
          <span className="text-xs font-mono text-success">Saved.</span>
        )}
        {message && (
          <span role="alert" className="text-xs font-mono text-danger">
            {message}
          </span>
        )}
      </form>
    </div>
  );
}
