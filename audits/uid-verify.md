# UID Verify — smoke check (2026-09-06)

- `id` → `uid=1500(tsagent) gid=1500(tsagent) groups=1500(tsagent)`
- `whoami` → `tsagent`
- `cat /proc/1/environ | tr "\0" "\n" | grep -c DATABASE_URL` → `0` matches (grep exit 1, so the fallback also printed `BLOCKED`); PID 1's environment is readable but contains no `DATABASE_URL`.
