/**
 * Phase 77 — a picture of the product on the landing page, drawn in
 * markup (no screenshot asset to go stale, themed like the app). Shows
 * the three things the product does: fleet health at a glance, an
 * assistant that knows the fleet, and a run that ended in a pull request.
 * Contents mirror the demo fleet (lib/demo.ts).
 */
const PROJECTS = [
  {
    name: "Atlas API",
    health: "Healthy",
    tone: "text-success",
    bar: "bg-success",
    width: "w-[72%]",
    pct: 72,
  },
  {
    name: "Meridian Web",
    health: "Warning",
    tone: "text-amber",
    bar: "bg-amber",
    width: "w-[41%]",
    pct: 41,
  },
  {
    name: "Beacon Mobile",
    health: "Blocked",
    tone: "text-danger",
    bar: "bg-danger",
    width: "w-[18%]",
    pct: 18,
  },
];

export function ProductPreview() {
  return (
    <figure
      aria-label="Preview of the TenSixtyThree dashboard"
      className="border border-space-600 bg-space-900 shadow-[0_0_24px_var(--glass-border)]"
    >
      <div
        aria-hidden="true"
        className="flex items-center gap-1.5 border-b border-space-600 bg-space-800 px-3 py-2"
      >
        <span className="h-2 w-2 rounded-full bg-space-600" />
        <span className="h-2 w-2 rounded-full bg-space-600" />
        <span className="h-2 w-2 rounded-full bg-space-600" />
        <span className="ml-2 text-micro font-mono uppercase tracking-wider text-muted">
          Dashboard
        </span>
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <ul className="grid gap-2 sm:grid-cols-3">
          {PROJECTS.map((p) => (
            <li
              key={p.name}
              className="border border-space-600 bg-space-800 p-3"
            >
              <p className="text-xs font-mono font-bold text-text-bright">
                {p.name}
              </p>
              <p className={`mt-1 text-micro font-mono uppercase ${p.tone}`}>
                <span aria-hidden="true">● </span>
                {p.health}
              </p>
              <div className="mt-2 h-1.5 bg-space-700">
                <div className={`h-1.5 ${p.bar} ${p.width}`} />
              </div>
              <p className="mt-1 text-micro font-mono text-muted">
                {p.pct}% complete
              </p>
            </li>
          ))}
        </ul>

        <div className="border border-space-600 bg-space-800 p-3 text-xs font-mono">
          <p className="text-text-dim">
            <span className="text-info">You:</span> What needs my attention
            today?
          </p>
          <p className="mt-2 text-text">
            <span className="text-cyan">Overseer:</span> Beacon Mobile is
            blocked on App Store credentials. Meridian has 3 failing checkout
            tests. Atlas finished its cloud run overnight.
          </p>
        </div>

        <div className="border border-space-600 bg-space-800 p-3 text-xs font-mono">
          <p>
            <span className="text-success">COMPLETED</span>
            <span className="text-text-dim">
              {" "}
              · Atlas API · 14 turns · $0.38
            </span>
          </p>
          <p className="mt-1 break-all text-success">
            Branch cloud/demo-atlas-retry · pull request ready for review
          </p>
        </div>
      </div>
      <figcaption className="sr-only">
        Three projects with health and progress, the assistant summarizing what
        needs attention, and a cloud run that finished with a pull request.
      </figcaption>
    </figure>
  );
}

const STEPS = [
  {
    n: "1",
    title: "Connect your repos",
    body: "Each project shows its health, progress and open tasks.",
  },
  {
    n: "2",
    title: "Ask what's next",
    body: "The assistant reads the fleet and proposes the work.",
  },
  {
    n: "3",
    title: "Review the pull request",
    body: "Runs happen in a sandbox and end in a PR. Nothing merges on its own.",
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="mt-12">
      <h2
        id="how-heading"
        className="text-sm font-mono font-bold uppercase tracking-wider text-cyan"
      >
        How it works
      </h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center border border-cyan text-xs font-mono text-cyan"
            >
              {s.n}
            </span>
            <div>
              <p className="text-sm font-mono font-bold text-text-bright">
                {s.title}
              </p>
              <p className="mt-1 text-xs font-mono text-text">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
