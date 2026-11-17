# Phase 67 — Cloud runner reliability and run visibility

Source: deep review (R4, R5, R7, R8, R13-R18, F9, F10). `attempts` /
`cancelRequested` columns → after phase 59.

## 67.1 — Deploys do not eat jobs
- Web-boot orphan reconcile filters `runtime: "local"` and updates
  conditionally on `status: "queued"`.
- Runner handles SIGTERM: stop claiming, abort the SDK via `abortController`,
  finalize the row `failed: interrupted` (requeue-able), exit inside
  Railway's grace window.
## 67.2 — Bounded retries, fenced results
- `Dispatch.attempts`; requeue increments; dead-letter after 3 with a clear
  message. Branch `cloud/<id>-<attempt>`. Lost heartbeat → abort, no push.
- Wall-clock limit per job; `cancelRequested` flag + cancel endpoint/button.
## 67.3 — Failures that explain themselves, work that is not thrown away
- `errorMessage` from the result subtype (turn limit, budget, cancelled,
  interrupted, clone failed). On a thrown error, attempt a partial push
  labelled as partial.
- Cloud signals feed the same writers as local sessions (HumanTask, lessons,
  DispatchOutcome with cost/turns), failed runs included.
- `githubRepo` normalized to `owner/repo` at write time.
## 67.4 — Run history UI
- Per-project "Cloud runs" list from the server (status, cost, branch, PR,
  reason), survives navigation; polling stops on every terminal state and
  when the tab is hidden.

## AC → tests
- Reconcile leaves cloud rows untouched; SIGTERM test finalizes the row.
- attempts=3 → dead-lettered; stale-runner finalize rejected; heartbeat
  false → no push/PR call.
- Each failure subtype → specific errorMessage; partial push on throw.
- Signal fixtures create HumanTask/lesson rows for cloud runs.
- Panel test: `timeout` is terminal; history renders after remount.
