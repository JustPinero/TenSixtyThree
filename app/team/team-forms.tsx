"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Phase 48.3 — client forms for team creation and invites. */
export function TeamSetupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [operator, setOperator] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        operatorEmail: email,
        operatorName: operator,
      }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json()).error ?? "Failed");
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Team name"
        className="w-full bg-space-900 border border-space-600 text-sm font-mono text-text-bright px-2 py-1.5"
      />
      <input
        value={operator}
        onChange={(e) => setOperator(e.target.value)}
        placeholder="Your name"
        className="w-full bg-space-900 border border-space-600 text-sm font-mono text-text-bright px-2 py-1.5"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        type="email"
        className="w-full bg-space-900 border border-space-600 text-sm font-mono text-text-bright px-2 py-1.5"
      />
      {error && <p className="text-xs font-mono text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !name || !email}
        className="px-4 py-1.5 bg-cyan text-space-900 text-sm font-mono font-bold uppercase disabled:opacity-50"
      >
        {busy ? "Creating…" : "Create Team"}
      </button>
    </form>
  );
}

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json();
    if (res.ok) {
      setToken(body.invite.token);
      setEmail("");
    } else setError(body.error ?? "Failed");
  }

  return (
    <form onSubmit={submit} className="flex items-start gap-2">
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="teammate@email.com"
        type="email"
        className="bg-space-900 border border-space-600 text-sm font-mono text-text-bright px-2 py-1.5"
      />
      <button
        type="submit"
        disabled={!email}
        className="px-3 py-1.5 border border-cyan text-cyan text-sm font-mono uppercase disabled:opacity-50"
      >
        Invite
      </button>
      {token && (
        <span className="text-xs font-mono text-space-500 self-center">
          Invite token (share it): <code className="text-cyan">{token}</code>
        </span>
      )}
      {error && (
        <span className="text-xs font-mono text-red-400 self-center">
          {error}
        </span>
      )}
    </form>
  );
}
