"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * Phase 51.2 — sign-in surface: GitHub primary, Google secondary, magic-link
 * fallback. No passwords, ever. Local single-user mode never routes here
 * until AUTH_REQUIRED is enabled (51.4).
 */
export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [magicSent, setMagicSent] = useState(false);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider">
          Sign in to TenSixtyThree
        </h1>
        <button
          onClick={() =>
            authClient.signIn.social({ provider: "github", callbackURL: "/" })
          }
          className="w-full border border-space-600 bg-space-800 px-4 py-2.5 text-sm font-mono text-text-bright hover:border-cyan"
        >
          Continue with GitHub
        </button>
        <button
          onClick={() =>
            authClient.signIn.social({ provider: "google", callbackURL: "/" })
          }
          className="w-full border border-space-600 bg-space-800 px-4 py-2.5 text-sm font-mono text-text-bright hover:border-cyan"
        >
          Continue with Google
        </button>
        <div className="border-t border-space-600 pt-4">
          {magicSent ? (
            <p className="text-sm font-mono text-space-500">
              Check your email for a sign-in link.
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await authClient.signIn.magicLink({
                  email,
                  callbackURL: "/",
                });
                setMagicSent(true);
              }}
              className="flex gap-2"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="flex-1 bg-space-900 border border-space-600 px-3 py-2 text-sm font-mono text-text-bright"
              />
              <button
                type="submit"
                disabled={!email}
                className="border border-cyan px-3 py-2 text-sm font-mono uppercase text-cyan disabled:opacity-50"
              >
                Email link
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
