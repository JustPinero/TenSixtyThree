import Link from "next/link";
import type { Metadata } from "next";
import { TryDemoButton } from "../components/try-demo-button";
import { ProductPreview, HowItWorks } from "./product-preview";

/**
 * Phase 68.1 — public landing page. Signed-out visitors to "/" land here
 * (lib/route-guard.ts) instead of a bare login box; the root layout
 * renders it without app chrome.
 */
export const metadata: Metadata = {
  title: "TenSixtyThree — run Claude Code across all your projects",
};

const POINTS = [
  {
    title: "One view of every project",
    body: "Health, progress, open tasks and recent activity for each repo, in one place.",
  },
  {
    title: "An assistant that knows your fleet",
    body: "Ask what needs attention. It reads project state, plans the next steps and proposes work.",
  },
  {
    title: "Runs that end in a pull request",
    body: "Send a task to the cloud runner. It clones the repo, does the work in a sandbox and opens a PR for review.",
  },
  {
    title: "Built for a team",
    body: "Invite-only workspaces, shared projects, boards and a roadmap, with each person's data kept to themselves.",
  },
];

export default function WelcomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl py-10 sm:py-16">
      {/* 77 — hero: the pitch and the way in on the left, a picture of
          the product on the right (stacked below lg). */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-bold font-mono tracking-wide text-text-bright">
            TenSixtyThree
          </h1>
          <p className="mt-3 text-base font-mono text-text">
            A control room for running Claude Code across many projects at once.
          </p>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="sm:w-64">
              <TryDemoButton />
              <p className="mt-2 text-micro font-mono text-muted">
                A private sandbox with sample projects. Nothing to install.
              </p>
            </div>
            <Link
              href="/signin"
              className="inline-flex min-h-6 items-center justify-center border border-cyan px-4 py-2.5 text-sm font-mono uppercase text-cyan hover:bg-cyan/10 focus-ring"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-3 text-xs font-mono text-text-dim">
            Access is by invitation.
          </p>
        </div>
        <div className="min-w-0">
          <ProductPreview />
        </div>
      </div>

      <HowItWorks />

      <ul className="mt-12 grid gap-4 sm:grid-cols-2">
        {POINTS.map((p) => (
          <li
            key={p.title}
            className="border border-space-600 bg-space-800 p-4"
          >
            <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider">
              {p.title}
            </h2>
            <p className="mt-2 text-sm font-mono text-text">{p.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
