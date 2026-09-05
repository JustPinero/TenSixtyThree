"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * 54.1 — sign-in surface. Invite-only: unknown emails are refused at the
 * server's invite gate regardless of method. Flows: GitHub/Google OAuth,
 * email code (works for invited first-timers AND returning users), and
 * password for accounts that set one after first login.
 */
export default function SignInPage() {
  const [mode, setMode] = useState<"code" | "password">("code");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Could not send a code to that email.");
      return;
    }
    setCodeSent(true);
  }

  async function signInWithCode() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.emailOtp({ email, otp });
    setBusy(false);
    if (err) {
      setError(
        err.message ??
          "That code didn't work. Codes expire after 10 minutes and 3 bad tries.",
      );
      return;
    }
    window.location.href = "/";
  }

  async function signInWithPassword() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (err) {
      setError(err.message ?? "Email or password didn't match.");
      return;
    }
    window.location.href = "/";
  }

  const inputClass =
    "w-full bg-space-900 border border-space-600 px-3 py-2 text-sm font-mono text-text-bright";
  const primaryBtn =
    "w-full border border-cyan px-3 py-2.5 text-sm font-mono uppercase text-cyan disabled:opacity-50 hover:bg-space-800";
  const oauthBtn =
    "w-full border border-space-600 bg-space-800 px-4 py-2.5 text-sm font-mono text-text-bright hover:border-cyan";

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider">
          Sign in to TenSixtyThree
        </h1>
        <p className="text-xs font-mono text-text-dim">
          Access is invite-only. Use the email your invitation was sent to.
        </p>

        <button
          onClick={async () => {
            setBusy(true);
            const res = await fetch("/api/demo", { method: "POST" });
            setBusy(false);
            if (res.ok) window.location.href = "/?demo=1";
            else setError("Demo is busy right now — try again in a bit.");
          }}
          disabled={busy}
          className="w-full border border-amber px-4 py-2.5 text-sm font-mono uppercase text-amber hover:bg-space-800 disabled:opacity-50"
        >
          Try the demo
        </button>

        <button
          onClick={() =>
            authClient.signIn.social({ provider: "github", callbackURL: "/" })
          }
          className={oauthBtn}
        >
          Continue with GitHub
        </button>
        <button
          onClick={() =>
            authClient.signIn.social({ provider: "google", callbackURL: "/" })
          }
          className={oauthBtn}
        >
          Continue with Google
        </button>

        <div className="border-t border-space-600 pt-4 space-y-3">
          <div className="flex gap-2 text-xs font-mono">
            <button
              onClick={() => setMode("code")}
              className={`px-2 py-1 border ${mode === "code" ? "border-cyan text-cyan" : "border-space-600 text-text-dim"}`}
            >
              Email code
            </button>
            <button
              onClick={() => setMode("password")}
              className={`px-2 py-1 border ${mode === "password" ? "border-cyan text-cyan" : "border-space-600 text-text-dim"}`}
            >
              Password
            </button>
          </div>

          <label className="block text-xs font-mono text-text-dim">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className={`${inputClass} mt-1`}
            />
          </label>

          {mode === "code" ? (
            codeSent ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  signInWithCode();
                }}
                className="space-y-3"
              >
                <label className="block text-xs font-mono text-text-dim">
                  6-digit code (check your email)
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    className={`${inputClass} mt-1 tracking-[0.4em]`}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy || otp.length < 6}
                  className={primaryBtn}
                >
                  {busy ? "Checking..." : "Sign in"}
                </button>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={busy}
                  className="w-full text-xs font-mono text-text-dim hover:text-text"
                >
                  Resend code
                </button>
              </form>
            ) : (
              <button
                onClick={sendCode}
                disabled={busy || !email}
                className={primaryBtn}
              >
                {busy ? "Sending..." : "Email me a code"}
              </button>
            )
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                signInWithPassword();
              }}
              className="space-y-3"
            >
              <label className="block text-xs font-mono text-text-dim">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className={`${inputClass} mt-1`}
                />
              </label>
              <button
                type="submit"
                disabled={busy || !email || !password}
                className={primaryBtn}
              >
                {busy ? "Checking..." : "Sign in"}
              </button>
              <p className="text-[11px] font-mono text-text-dim">
                No password yet? Sign in with an email code first — you&apos;ll
                be prompted to create one.
              </p>
            </form>
          )}

          {error && (
            <p role="alert" className="text-xs font-mono text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
