# Phase 76 — a demo that shows the product (review items 4, 7)

The demo never showed the two things the product is for: an assistant that
knows the fleet, and runs that end in a pull request.

- **Scripted assistant per question** (`lib/demo-overseer.ts`, pure):
  keyword-routed replies about the seeded fleet — attention / blocked,
  Meridian, Atlas, Beacon, plan the week, audits, cloud runs / PRs, what is
  this — with a helpful default that lists what to ask. Zero spend (still no
  Anthropic call). Same for the project chat if it is canned.
- **Seeded fleet with history** (`seedDemo`): a third project (Beacon
  Mobile, blocked), `githubRepo` on each project, activity events spread
  over the last days, open human tasks, audit snapshots with grades, and one
  finished cloud run per Atlas (completed Dispatch + outcome + progress
  events + result branch + PR link) so the project page shows a run
  history. Everything hangs off demo projects, so the existing cascade
  delete sweeps it.

## AC → tests
- demo-overseer: each intent returns its scripted reply naming the right
  project; unknown input → default listing suggestions; no `**` split
  across lines in any reply.
- overseer route: demo POST streams the reply matching the question.
- seedDemo (rig DB): 3 projects, ≥6 activity events, ≥3 open tasks, audit
  snapshots, a completed cloud dispatch with resultPrUrl; cleanupDemo
  removes all of it.
