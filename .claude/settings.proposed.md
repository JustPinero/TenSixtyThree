# Proposed config changes

Claude is blocked from editing settings (the classifier calls it
Self-Modification). That guard is correct — an agent should not rewrite its
own permission boundary — so these are written out for you to apply.

## 1. Project `.claude/settings.json`
Copy `.claude/settings.proposed.json` over `.claude/settings.json`, minus
the `_comment` key.

**Hooks.** The two `PostToolUse` hooks both called `npx prettier`. Prettier
is not a dependency, there is no prettier config, and no binary exists in
`node_modules` — so every edit silently invoked a missing package and
formatted nothing. The eslint hook also matched only `.tsx`/`.jsx`, which
skips 245 of 347 source files. Replaced by one hook running the linter the
project actually has, across `.ts` and `.tsx`.

**New `Stop` hook.** Advisory reminder to run `scripts/validate.sh` when
`lib/` or `app/` have uncommitted changes. It always exits 0, so it can
never block a turn. ("Looks done" being the only completion signal is a
known failure mode.)

**Permissions, narrowed not widened.** The committed file granted
`Bash(rm *)`, `Bash(gh *)` and `Bash(op *)` — i.e. any `rm`, plus
`gh repo delete` and `op item delete` — in a PUBLIC repo. Your user-level
`ask` rules catch the specific destructive subcommands, so you were covered
in practice, but the committed file read as though you were not. Those move
to `ask`, and read-only Railway/Docker/`gh run` commands are added so
routine work stops prompting.

## 2. User `~/.claude/settings.json`

**a. The database guard protects the wrong database.** Project
`.claude/settings.local.json` has:

> "Never run destructive database operations on this project's live SQLite
> database: no `prisma migrate reset`... no deleting/overwriting dev.db..."

SQLite was retired in Phase 51. `dev.db` is a legacy backup. Production is
Railway Postgres, which this rule never mentions. Two problems: it is
stale, and `autoMode` is read from the USER settings file, so a rule in a
project file may not be in effect at all. Suggested replacement, in
`autoMode.hard_deny` in `~/.claude/settings.json`:

```
Never run destructive operations against TenSixtyThree's hosted Railway
Postgres: no `prisma migrate reset`, no `prisma db push --force-reset`, no
DROP/TRUNCATE against the production DATABASE_URL, and no deletion of the
Railway Postgres service. Schema changes go through a migration with a
verified dump taken first. The local `tensixtythree-pg` container and the
`test_rig_*` databases are throwaway and may be dropped freely.
```

**b. The environment block has two projects mixed together.** It carries
entries for both this project and matinecock-site in one list, and it
states "Cloud provider(s): Vercel (deploy targets: tensixtythree.com)".
That is wrong — tensixtythree.com is Cloudflare DNS/TLS in front of
Railway, and there is no Vercel in this project's path. The classifier is
reasoning about this repo from inaccurate facts. Correct that line to:

```
**Cloud provider(s)**: Cloudflare (DNS + TLS + the tensixtythree-edge
Worker for www.tensixtythree.com); Railway (app + cloud runner + Postgres,
origin tensixtythree-app-production.up.railway.app)
```

**c. Optional, to stop the repeated blocking.** Production deploys and the
Cloudflare bring-up were refused many times this session even with explicit
permission in chat, because the classifier outranks chat. If you want those
runnable without toggling modes, add to `autoMode.allow` (keep
`"$defaults"` as the first entry or you discard every built-in exception):

```
"$defaults",
"Running `pnpm infra:cloudflare` and `railway up --service tensixtythree-app` for this project is expected operational work"
```

Only do this if you are comfortable with Claude deploying unprompted.
Leaving it off and flipping `/permissions` to default mode when you want a
deploy is the more conservative choice.

## 3. Already applied (code, not config)
- `.claude/rules/db.md` given `paths:` frontmatter. It was the only
  unscoped rules file, so the longest of the four loaded on every turn.
- `.claude/agents/merciless-reviewer.md` and `drift-auditor.md` — the
  review passes previously spawned ad hoc, now reusable. The reviewer uses
  `isolation: worktree`.
- `.claude/skills/request/` — the CLAUDE.md action loop as an invocable
  skill, carrying the two hazards that cost real time (concurrent Vitest
  runs; trusting a local green run on a memory-tight host).
