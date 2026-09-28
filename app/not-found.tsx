import Link from "next/link";

/**
 * Phase 63.4 — a bad slug previously fell through to Next's default 404,
 * which renders outside the theme (white page, system font).
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <h1 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider">
        404 — Not found
      </h1>
      <p className="text-sm font-mono text-text">
        That page does not exist. It may have been renamed or removed.
      </p>
      <Link
        href="/"
        className="px-3 py-1.5 text-xs font-mono border border-space-600 text-text hover:text-text-bright hover:border-cyan transition-colors focus-ring"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
