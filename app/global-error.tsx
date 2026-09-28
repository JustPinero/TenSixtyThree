"use client";

/**
 * Phase 63.4 — last-resort boundary for a throw in the root layout, where
 * the normal error.tsx cannot render. It must supply its own <html>/<body>
 * and cannot rely on the theme provider, so it uses the cyberpunk default
 * tokens inline rather than leaving the user on a blank white page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" data-theme="cyberpunk">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#060910",
          color: "#e4e8ee",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "0.875rem", color: "#41a6b5", letterSpacing: "0.05em" }}>
          SOMETHING BROKE
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#c5ccd8" }}>
          The application failed to start. {error.digest ? `Ref ${error.digest}.` : ""}
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "0.375rem 0.75rem",
            fontSize: "0.75rem",
            fontFamily: "inherit",
            color: "#e4e8ee",
            background: "transparent",
            border: "1px solid #242a3d",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
