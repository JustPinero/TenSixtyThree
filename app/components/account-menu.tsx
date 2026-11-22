"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Phase 68.3 — who am I, sign out, password, API key. Demo sessions get
 * "Exit demo", which ends the session server-side. Renders nothing for
 * the bare local operator (no account to show).
 */
interface Account {
  user: { name: string; email: string; role: string; isDemo: boolean };
  hasPassword: boolean;
  hasAnthropicKey: boolean;
}

export async function exitDemo(): Promise<void> {
  try {
    await fetch("/api/demo", { method: "DELETE" });
  } finally {
    window.location.href = "/welcome";
  }
}

export function AccountMenu() {
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Account | null) => {
        if (!cancelled && data?.user) setAccount(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!account) return null;
  const { user } = account;

  return (
    <div className="px-4 py-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-6 text-left text-xs font-mono text-text hover:text-text-bright focus-ring"
      >
        <span className="block truncate text-text-bright">
          {user.isDemo ? "Demo visitor" : user.name}
        </span>
        {!user.isDemo && (
          <span className="block truncate text-text-dim">{user.email}</span>
        )}
      </button>
      {open && (
        <ul id="account-menu" className="mt-2 space-y-1 text-xs font-mono">
          {user.isDemo ? (
            <li>
              <button
                type="button"
                onClick={() => void exitDemo()}
                className="min-h-6 text-cyan underline focus-ring"
              >
                Exit demo
              </button>
            </li>
          ) : (
            <>
              <li>
                <Link
                  href="/settings#password"
                  className="min-h-6 inline-block text-cyan underline focus-ring"
                >
                  {account.hasPassword ? "Change password" : "Set a password"}
                </Link>
              </li>
              <li>
                <Link
                  href="/settings#api-key"
                  className="min-h-6 inline-block text-cyan underline focus-ring"
                >
                  {account.hasAnthropicKey
                    ? "Your API key"
                    : "Add your API key"}
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={async () => {
                    await authClient.signOut().catch(() => {});
                    window.location.href = "/welcome";
                  }}
                  className="min-h-6 text-cyan underline focus-ring"
                >
                  Sign out
                </button>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
