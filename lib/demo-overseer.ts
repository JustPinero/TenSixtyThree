/**
 * Phase 76 — the demo's scripted assistant.
 *
 * Demo sessions never call Anthropic (zero spend, 54.5). Instead of one
 * canned paragraph for every question, the visitor's question is routed by
 * keyword to a reply written about the fleet `seedDemo` creates (Atlas API,
 * Meridian Web, Beacon Mobile). Pure — no I/O. Keep the facts here in step
 * with lib/demo.ts.
 *
 * Markdown rule: bold (`**`) never spans a line break; the chat renderer
 * works line by line (enforced by lib/demo-overseer.test.ts).
 */

export const DEMO_REPLIES = {
  attention: [
    "Here's what needs you today:",
    "",
    "1. **Beacon Mobile is blocked.** It's waiting on App Store Connect credentials — there's an open task for you on the Tasks page. Nothing moves until that's in.",
    "2. **Meridian Web needs a look.** The last session left 3 failing tests in the checkout flow, and its health is at warning.",
    "3. **Atlas API is in good shape.** Last night's cloud run finished and pushed a branch with retry-with-backoff for the webhook client — it's ready for review.",
    "",
    "Want me to plan the week around that?",
  ].join("\n"),
  meridian: [
    "**Meridian Web** — phase 2 (dashboard), 41% complete, health: warning.",
    "",
    "- The last session ended with 3 failing tests in the checkout flow.",
    "- Latest test audit: grade **C** — the cart edge cases have no coverage.",
    "- Next request: finish the dashboard filters, then fix the checkout tests.",
    "",
    "In your own workspace I'd offer to send a cloud run to fix the failing tests and open a pull request.",
  ].join("\n"),
  atlas: [
    "**Atlas API** — phase 4 (integrations), 72% complete, health: healthy.",
    "",
    "- Last night's cloud run finished in 14 turns for $0.38 and pushed `cloud/demo-atlas-retry` with retry-with-backoff for the webhook client.",
    "- Latest audit: grade **A-** — one note about slow integration tests.",
    "- Open on the board: wire health-check alerts.",
    "",
    "Open the project page to see the run's history and progress log.",
  ].join("\n"),
  beacon: [
    "**Beacon Mobile** — phase 1 (foundation), 18% complete, health: blocked.",
    "",
    "- Blocked on a human task: App Store Connect credentials for TestFlight builds.",
    "- The agent stopped instead of guessing — it flagged the task and moved on.",
    "",
    "Once the credentials are in, the next run can pick up the build pipeline.",
  ].join("\n"),
  plan: [
    "A plan for this week:",
    "",
    "- **Monday:** unblock Beacon Mobile — add the App Store credentials (your task), then start its build-pipeline run.",
    "- **Tuesday:** review and merge the Atlas API retry branch.",
    "- **Wednesday–Thursday:** send a cloud run at Meridian Web's failing checkout tests, then finish the dashboard filters.",
    "- **Friday:** run audits across all three and read the morning briefing.",
    "",
    "In your workspace I'd queue those runs for you once you approve.",
  ].join("\n"),
  audit: [
    "Latest audit grades across the fleet:",
    "",
    "- **Atlas API:** grade A- (tests), B+ (bug hunt) — healthy.",
    "- **Meridian Web:** grade C (tests) — checkout edge cases uncovered, 3 failing.",
    "- **Beacon Mobile:** no audits yet — it's blocked before its first build.",
    "",
    'In your own workspace, "run a full audit" sends an audit run to each project and the results land here and in the morning briefing.',
  ].join("\n"),
  runs: [
    "Cloud runs are how work gets done here:",
    "",
    "1. You (or I) send a task to a project.",
    "2. The runner clones the repo into a sandbox and works as an unprivileged user with a spending cap.",
    "3. It pushes a branch and opens a **pull request** for you to review — nothing merges on its own.",
    "",
    "In the demo, runs are switched off, but Atlas API has a finished one: open its project page to see the run history.",
  ].join("\n"),
  about: [
    "**TenSixtyThree** is a control room for running Claude Code across many projects.",
    "",
    "- One dashboard with every project's health, progress and activity.",
    "- An assistant (me) that reads that state and plans the work.",
    "- Cloud runs that end in a pull request.",
    "- Boards, a roadmap and a team feed for the people involved.",
    "",
    "This demo fleet is fake and resets; ask me about Atlas, Meridian or Beacon.",
  ].join("\n"),
  fallback: [
    "I'm scripted in the demo, so I can only answer questions about this sample fleet. Try:",
    "",
    '- "What needs my attention today?"',
    '- "How is Meridian doing?"',
    '- "Why is Beacon blocked?"',
    '- "Plan this week\'s work"',
    '- "How do cloud runs work?"',
    "",
    "In your own workspace I read your real projects and can answer anything about them.",
  ].join("\n"),
} as const;

export type DemoIntent = keyof typeof DEMO_REPLIES;

/** First match wins — specific projects and actions before broad words. */
const ROUTES: [DemoIntent, RegExp][] = [
  ["meridian", /\bmeridian\b/i],
  ["atlas", /\batlas\b/i],
  ["beacon", /\bbeacon\b/i],
  ["audit", /\baudit/i],
  ["runs", /\b(pull request|pr|dispatch|cloud|run|runs|runner|branch)\b/i],
  ["plan", /\b(plan|week|sprint|schedule|roadmap)\b/i],
  [
    "attention",
    /\b(attention|blocked|today|priorit\w*|urgent|status|health|broken|focus)\b/i,
  ],
  [
    "about",
    /\b(what is this|what are you|who are you|how does this work|help|tensixtythree|1063)\b/i,
  ],
];

export function demoIntent(question: string): DemoIntent {
  for (const [intent, pattern] of ROUTES) {
    if (pattern.test(question)) return intent;
  }
  return "fallback";
}

export function demoOverseerReply(question: string): string {
  return DEMO_REPLIES[demoIntent(question)];
}

/** Project-page chat in the demo: answer about the project being viewed. */
export function demoProjectReply(
  projectName: string,
  question: string,
): string {
  const name = projectName.toLowerCase();
  if (name.includes("atlas")) return DEMO_REPLIES.atlas;
  if (name.includes("meridian")) return DEMO_REPLIES.meridian;
  if (name.includes("beacon")) return DEMO_REPLIES.beacon;
  const intent = demoIntent(question);
  return [
    `I'm scripted in the demo, so I can't read ${projectName} for real.`,
    "",
    intent === "fallback"
      ? "In your own workspace, project chat knows this project's code, requests and history."
      : DEMO_REPLIES[intent],
  ].join("\n");
}

export const DEMO_BRIEFING = [
  "**Good morning.** This is a sample briefing — in your own workspace the Overseer writes one each morning from your projects' real activity.",
  "",
  "**Needs attention:**",
  "- Beacon Mobile is blocked waiting on a human task (App Store credentials).",
  "- Meridian Web has 3 failing checkout tests.",
  "",
  "**Completed since last briefing:**",
  "- A cloud run on Atlas API finished and pushed a branch with retry-with-backoff for the webhook client.",
  "",
  "**Suggested next step:** add Beacon's credentials, then review the Atlas branch.",
].join("\n");
