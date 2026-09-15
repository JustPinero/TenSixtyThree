# TenSixtyThree

[![npm version](https://img.shields.io/npm/v/@justpinero/create-cascade?label=create-cascade&color=0366d6)](https://www.npmjs.com/package/@justpinero/create-cascade)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![Tests](https://img.shields.io/badge/tests-1450+-brightgreen)](#)

A nerve center for orchestrating multi-project Claude Code workflows. The **Overseer**, your customizable AI fleet dispatcher, manages your projects, learns from every session, and tells you when it needs you.

**The name:** *10-63* is the radio code a unit calls when it's en route. (**1063**, **10-63**, and **TenSixtyThree** all refer to this project.) Dispatched, rolling, and reporting back. That's what this platform does with AI engineering sessions. (Formerly known as Cascade.)

---

## Install

```bash
npx @justpinero/create-cascade
```

That's it. The installer detects your OS, checks prerequisites, clones the repo, bootstraps 1Password for secrets, wires Claude Code's Stop hooks, initializes the database, smoke-tests the API, and prints the URL. Run it inside WSL2 on Windows, or any shell on macOS/Linux.

Package on npm: [`@justpinero/create-cascade`](https://www.npmjs.com/package/@justpinero/create-cascade) · source: [`JustPinero/create-cascade`](https://github.com/JustPinero/create-cascade)

If you want to understand exactly what it does, or install manually, read on.

---

## What It Does

- **Fleet Dashboard** — monitor health, progress, and status across all your projects at a glance. Shipped projects show a "Deployed" / "Complete" badge; in-flight projects show a phase-based progress bar
- **The Overseer (a tool-using agent)** — Claude Sonnet wired through Anthropic's tool-use API with 14 built-in tools. Reads project state, fleet activity, session logs, dispatch outcomes, the playbook, and engineer messages on demand instead of cramming everything into a 6K-token system prompt
- **Structured Working Memory** — every chat is bound to a `ChatSession` with a JSON `workingMemory` document. The Overseer writes confirmed values via `update_session_memory` so they survive across turns instead of getting lost in conversation prose
- **Inventory-Walk Pattern** — explicit conversation flows (`inventory_walk`, `dispatch_planning`, `incident_triage`) keep the Overseer grounded across long fleet reviews without repeating questions or losing answers
- **History Compression** — once a conversation exceeds 25 turns, older messages get summarized via Haiku and cached on the session. Falls back to raw truncation if Haiku is unhealthy
- **Closed Feedback Loop** — sessions report back automatically via Stop hooks. TenSixtyThree knows when sessions end, what happened, what went wrong
- **Memory-Safe Concurrency** — subagent spawns go through a queue sized to your host RAM (1 slot on <16GB, 2 on 16–32GB, 4 on ≥48GB). No more terminal deaths on laptops
- **1Password-Backed Secrets** — your Anthropic API key lives in 1Password. `.env` holds `op://` references; plaintext never touches disk
- **Knowledge Base** — lessons harvested from project history. The Overseer uses these to advise other projects
- **Morning Briefing** — auto-generated summary of what happened overnight, what's blocked, what to prioritize
- **Semi-Auto Dispatch** — routine "continue" operations execute without approval
- **Human Tasks** — things only you can do (upload assets, get API keys) tracked in a checklist. Claude sessions auto-create them via `[HUMAN TODO]` tags
- **Voice Output (TTS)** — the Overseer can speak responses aloud via the browser's Web Speech API. Voice, rate, and pitch all configurable; toggle on/off from the chat header
- **Voice Input + Conversation Mode** — speak to the Overseer (single-shot toggle, hold-to-talk push-to-talk, or hands-free Conversation Mode that auto-submits on silence and reopens the mic after the response). Configurable silence threshold; Esc bails out instantly
- **Desktop Notifications** — get notified when sessions end or blockers are detected
- **Retroactive Harvest** — extract lessons from project git history, even projects started before TenSixtyThree existed
- **Engineering Methodology** — projects bootstrapped via a kickoff template that generates CLAUDE.md, TDD-enforced request files, audit skills, and deployment references

---

## Prerequisites

You need these installed yourself. `create-cascade` checks for them and prints install commands if missing.

| Tool | Why | Minimum |
|------|-----|---------|
| Node.js | Runtime | 22+ |
| pnpm | Package manager | any recent |
| Docker | Local Postgres 16 (`docker-compose.dev.yml`) | any recent |
| Claude Code CLI | Subagent runtime | any |
| tmux | Multi-pane dispatch | any |
| 1Password CLI (`op`) | Secrets source | 2.x |
| 1Password account | Any plan (Individual/Family/Business) | — |

### macOS
```bash
brew install node@22 tmux
corepack enable pnpm
npm install -g @anthropic-ai/claude-code
brew install --cask 1password-cli
```

### Windows (WSL2 required)
Install WSL2 first from PowerShell:
```powershell
wsl --install
```
Then inside your WSL shell:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash
sudo apt-get install -y nodejs tmux
corepack enable pnpm
npm install -g @anthropic-ai/claude-code
# 1Password CLI: https://developer.1password.com/docs/cli/get-started/
```
Also install **1Password Desktop for Windows**, then enable *Settings → Developer → "Integrate with 1Password CLI"* so `op` re-auths via Windows Hello.

### Linux
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash
sudo apt-get install -y nodejs tmux
corepack enable pnpm
npm install -g @anthropic-ai/claude-code
# 1Password CLI: https://developer.1password.com/docs/cli/get-started/
```

---

## 1Password is Required — Why

TenSixtyThree uses 1Password as a runtime secret source. `.env` contains `op://` references (no plaintext secrets on disk) and `pnpm dev` wraps with `op run --env-file=.env --` so the Next.js process receives resolved values at startup.

Trade-offs of this choice:
- ✅ No secret in git, no secret in plaintext files, one-click revoke in 1P UI
- ✅ Same key works on every machine via 1P sync — no cross-machine drift
- ⚠️ You need a 1P account (any plan). No plaintext fallback
- ⚠️ If `op signin` expires mid-run, TenSixtyThree keeps working (env already resolved into process memory); only a restart requires fresh auth

---

## Manual Install (if you'd rather not use `create-cascade`)

```bash
gh repo clone JustPinero/TenSixtyThree ~/Code/cascade
cd ~/Code/cascade
pnpm install

# 1Password: create vault and item
op vault create Cascade
op item create \
  --category="API Credential" \
  --title="Cascade Runtime" \
  --vault=Cascade \
  "anthropic_api_key[password]=sk-ant-YOUR-KEY"

# Environment
cp .env.example .env
# .env already contains op:// references; just adjust PROJECTS_DIR

# Claude Code Stop hooks
pnpm exec tsx scripts/install-hooks.ts

# Database — Postgres 16 in Docker (container: tensixtythree-pg, port 127.0.0.1:51063)
docker compose -f docker-compose.dev.yml up -d
pnpm exec prisma db push
pnpm exec prisma generate
pnpm db:seed

# Start
pnpm dev
```

Open **http://localhost:3000**.

---

## First Use

1. Click **Scan Projects** to import projects from your `PROJECTS_DIR`
2. Click **The Overseer** in the sidebar to talk to the AI dispatcher
3. Tell him what you want done — he creates a dispatch plan
4. Approve and dispatch — TenSixtyThree opens a tmux grid with one Claude session per project (gated by the memory-safe queue)

Projects need `CLAUDE.md` + `.git` + `package.json` (or `Cargo.toml` / `pyproject.toml`) to be dispatch-ready. The Overseer will tell you what's missing.

---

## Pages

| Page | Purpose |
|------|---------|
| **Sign in** (`/signin`) | Invite-only sign-in — email code, password, GitHub or Google OAuth. **Try the demo** mints a 2-hour sandbox with no account (hosted instances) |
| **Dashboard** | Project tiles with health, progress, activity feed, morning briefing |
| **The Overseer** | Full-screen AI chat — sprint planning, dispatch, fleet management |
| **My Tasks** | Human-only tasks checklist (assets, credentials, manual testing) |
| **Roadmap** | Bird's-eye table of all projects with progress bars |
| **Boards** (`/boards`) | Kanban boards — personal or org-scoped, drag tickets between columns, milestones, Linear import |
| **Organizations** (`/team`) | Multi-org workspace — members, invites, shared projects, typed team feed (goals / bugs / test requests / notes). Requires a signed-in session |
| **Playbook** | Rules that shape every dispatched Claude session |
| **Knowledge Base** | Lessons harvested from all projects, searchable |
| **Templates** | Kickoff templates for the project creation wizard |
| **Reports** | Per-project and cross-project reports (Markdown + PDF) |
| **Settings** | Theme, notifications, sounds, auto-dispatch, concurrency override, Overseer identity (name + idle/talking portraits), Voice (TTS on/off, voice picker, rate/pitch, mic input mode, silence threshold) |

---

## Key Concepts

**The Overseer** — Claude Sonnet instance running inside TenSixtyThree as a tool-using agent. Customizable name, portrait (idle + optional talking face), and voice. Plans sprints, recommends dispatches, tracks outcomes. Tools rather than prompt-injected snapshots — fresh project state on every read, structured working memory on every write.

**Tool Framework** (`lib/overseer-tools.ts`) — `Tool` type + `ToolRegistry` + `runToolUseLoop`. Decoupled from Anthropic's SDK by an injectable `AnthropicCaller`, so tests drive canned responses and a future cloud-TTS or alternate model swaps in cleanly. 14 built-in tools cover read (`query_project`, `query_projects`, `get_recent_activity`, `get_session_logs`, `get_dispatch_outcomes`, `get_yesterday_summary`, `get_engineer_messages`, `get_playbook`, `get_session_state`) and write (`update_session_memory`, `set_active_flow`, `propose_dispatch`, `create_reminder`, `create_human_todo`).

**ChatSession + workingMemory** — every chat turn is bound to a `ChatSession` row with a JSON `workingMemory` column. The Overseer writes confirmed values there during inventory walks, so a follow-up turn ("actually medipal is at 40%") reconciles cleanly instead of fighting a stale prompt.

**Stop Hooks** — Claude Code hooks installed on every project. When a session ends, the hook pings TenSixtyThree's webhook. TenSixtyThree auto-scans, releases the dispatch queue slot, fires desktop notifications, and harvests lessons.

**Dispatch Queue** — process-wide concurrency gate. Every subagent spawn goes through `lib/dispatch-queue.ts`. Default cap auto-detects from host RAM; override via `CASCADE_MAX_CONCURRENT_SUBAGENTS` in `.env`.

**Engineer Brain** — optional architectural pattern. A separate Claude Code instance dedicated to building TenSixtyThree itself, distinct from the per-project Claude sessions you dispatch into your other repos. Worth giving its own identity (this project's author named theirs **Kilroy**) because it has a bird's-eye view across the whole fleet and is the Claude you talk to when working on the platform's internals or your dispatch service. The engineer brain communicates with the Overseer via the engineer channel — a gitignored Markdown file the Overseer reads on load (`app/api/overseer/chat/route.ts` looks for `.claude/engineer-channel.md` first, falling back to `.claude/kilroy-channel.md` for back-compat). When the Overseer emits an `[ENGINEER]` tag in chat output, the route appends it to the channel automatically.

**Backburner** — project status for intentionally parked projects. Suppressed from sprint planning.

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server (wrapped with `op run`) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server (wrapped with `op run`) |
| `pnpm test` | Run test suite (Vitest) |
| `pnpm lint` | ESLint |
| `scripts/validate.sh` | Full CI validation (env + lint + types + test + build) |
| `pnpm exec tsx scripts/install-hooks.ts` | Install Stop hooks on all projects |

---

## Stack

- **Frontend:** Next.js 16 (App Router), TypeScript strict, Tailwind CSS 4
- **Database:** Postgres 16 via Prisma 7 (`@prisma/adapter-pg`). Local dev runs the `tensixtythree-pg` Docker container from `docker-compose.dev.yml`; hosted uses Railway Postgres
- **Auth:** Better Auth — invite-only, email code / password / GitHub + Google OAuth; organizations via the org plugin. Local single-operator mode runs with `AUTH_REQUIRED` unset
- **Hosting:** Railway, two services from one repo — `tensixtythree-app` (Next.js) and `tensixtythree-runner` (cloud agent runner, `RUNNER_MODE=1`) — plus Postgres
- **AI:** Anthropic Claude API (Sonnet for chat, Haiku for briefing/harvest); cloud runs use the Claude Agent SDK
- **Testing:** Vitest + Playwright E2E
- **Dispatch:** local — tmux + Claude Code CLI, queued via `lib/dispatch-queue.ts`; hosted — `Dispatch` rows with `runtime: "cloud"` claimed by the runner service
- **Secrets:** 1Password CLI, `op run` wrapper (local); Railway service variables (hosted)

---

## Hosted Deployment

One repo, two Railway services, one Postgres:

- **App service** — Next.js. `railway.json` sets the build (`prisma generate && pnpm build`), pre-deploy (`prisma db push`), start (`pnpm start:hosted` — no `op run`), and healthcheck (`/api/health`).
- **Runner service** — same repo with `RUNNER_MODE=1`; the `start` script branches into `scripts/runner.ts`, which polls for queued cloud dispatches and executes them with the Claude Agent SDK. Guardrails via `RUNNER_MAX_TURNS` / `RUNNER_MAX_BUDGET_USD`. See [`references/deployment-landmines.md`](references/deployment-landmines.md) — new Railway services ignore `railway.json`.

Every env var the app reads is catalogued in [`lib/env-manifest.ts`](lib/env-manifest.ts) with a scope (`hosted-required` / `hosted-optional` / `local-only`); the full table is in [`references/env-vars.md`](references/env-vars.md). A hosted instance must set all `hosted-required` vars — `GET /api/health` (unauthenticated) reports any that are missing under `missingEnv`, and returns 503 when the database is unreachable.

`AUTH_REQUIRED=true` enforces sessions on a hosted instance. Sign-in is invite-only; `ADMIN_EMAILS` is the bootstrap allowlist. `/signin`, `/api/health`, `/api/demo`, and `/.well-known/` stay public — **Try the demo** works without an account.

---

## Troubleshooting

Full reference: [`docs/troubleshooting.md`](docs/troubleshooting.md). Highlights below.

**"1Password not ready" on startup** — either `op` isn't installed or your session expired. Run `op signin`, or enable 1P Desktop → Developer → "Integrate with 1Password CLI" for biometric re-auth.

**"op read failed for op://..."** — the referenced vault or item doesn't exist. Run `op item get "Cascade Runtime" --vault Cascade` to confirm; recreate with the manual-install flow above if needed.

**WSL2 terminals die under load** — your commit limit is too low. On Windows, raise the page file to 32–64GB (admin PowerShell):
```powershell
$cs = Get-CimInstance Win32_ComputerSystem
Set-CimInstance -InputObject $cs -Property @{AutomaticManagedPagefile=$false}
$pf = Get-CimInstance Win32_PageFileSetting -Filter "Name='C:\\pagefile.sys'"
Set-CimInstance -InputObject $pf -Property @{InitialSize=32768; MaximumSize=65536}
```
Also write `%UserProfile%\.wslconfig`:
```ini
[wsl2]
memory=16GB
swap=16GB
autoMemoryReclaim=gradual
sparseVhd=true
```
Reboot.

**"credit balance too low"** — add credits at console.anthropic.com → Plans & Billing. TenSixtyThree uses ~$3-5/month in normal use.

**No projects found** — check `PROJECTS_DIR` in `.env` points to your projects folder.

**Projects show "not dispatch-ready"** — add a `CLAUDE.md` file to the project root, initialize git, ensure a `package.json` / `Cargo.toml` / `pyproject.toml` exists.

**Database connection refused / Prisma can't reach Postgres** — the local DB is the `tensixtythree-pg` Docker container. Check it's up with `docker ps`; start it with `docker start tensixtythree-pg` (or `docker compose -f docker-compose.dev.yml up -d` on a fresh machine). `DATABASE_URL` should point at `127.0.0.1:51063` — `postgresql://tensixtythree:tensixtythree@127.0.0.1:51063/tensixtythree`.

**Terminal crashes across the board** — could be Windows host running out of committed memory. See "WSL2 terminals die under load" above; the fix is the same.

---

## What Shipped in 1.0

1.0 turned the single-operator tool into a hosted **team platform** without giving up local mode:

- **Hosted control plane** — Postgres everywhere, Railway deploy, `/api/health` self-diagnosis, `lib/env-manifest.ts` as the machine-checked env catalog
- **Identity** — Better Auth users with invite-only sign-up (`ADMIN_EMAILS` bootstrap, admin-issued invites, password-after-first-login), organizations on the org plugin (`Organization` / `Member` / `Invitation`), and a project visibility matrix (owned + org-shared; strangers get 404)
- **Organizations** — multi-org workspace, project sharing, a typed team feed (goals, objectives, bugs, test requests, notes), org invites that apply on first sign-in
- **Boards & roadmap** — kanban boards (personal or org), tickets with fractional ordering, milestones, idempotent Linear import
- **Cloud runner** — hosted dispatches run on a second Railway service via the Claude Agent SDK as an unprivileged user, then push a branch and open a PR. Project autonomy is honored (`manual` is refused — nobody can approve headless)
- **BYOK + encryption** — users store their own Anthropic key, orgs store a Linear key, both sealed at rest with `ENCRYPTION_KEY`
- **Demo mode** — "Try the demo" on `/signin` mints an ephemeral sandbox (2-hour session, swept after 24h, rate-limited) with a canned Overseer and refused spend paths
- **Theme packs & personas** — 12 packs, each with a persona that actually shapes the Overseer's system prompt

The **collision plane** — one feed that sees both human assignments and live agent work so overlapping edits get flagged — remains the product thesis; see [`docs/cascade-2.0-team-direction.md`](docs/cascade-2.0-team-direction.md).

**Next:** known debt carried into 1.0 is tracked in [`audits/debt.md`](audits/debt.md). Start there.

---

## License

MIT
