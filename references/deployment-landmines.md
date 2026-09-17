# Deployment Landmines

Stack-specific warnings for Next.js + Prisma/Postgres + Railway + Anthropic API.

## Next.js App Router
- **Server vs Client boundary**: `fs`, `child_process`, and Prisma can ONLY be used in server components and API routes. Any component using these must NOT have "use client" directive.
- **Route handlers**: API route files must export named HTTP method functions (GET, POST, etc.), not default exports.
- **Dynamic routes**: `[slug]` directories must use `params` prop correctly — it's a Promise in Next.js 15+.
- **Metadata**: Use `generateMetadata` in server components, not in client components.
- **Streaming**: When using Anthropic API streaming in API routes, use `ReadableStream` and proper `Response` objects.

## Prisma + Postgres (hosted-first since Phase 51)
- **Real concurrency**: Postgres has no single-writer safety net. Find-or-create flows need `pg_advisory_xact_lock`; read-modify-write needs `SELECT ... FOR UPDATE` (see `lib/chat-session.ts`, `lib/runner/claim.ts`). Two production races were found by prod-parity tests during the migration.
- **`db push` in prod** (`railway.json` preDeploy) — acceptable at 1.0; convert to `prisma migrate` before real customer data ([51.D1]).
- **Schema changes ride the WEB service's preDeploy** — deploy `tensixtythree-app` before `tensixtythree-runner` after any schema change, or the runner ticks `ColumnNotFound` until restarted.
- **New Railway services IGNORE `railway.json`** (Railpack default): `prisma generate` runs on `postinstall`, and the plain `start` script branches on `RUNNER_MODE` — that is how the runner service boots. Runtime image also lacks git (`RAILPACK_DEPLOY_APT_PACKAGES=git`).
- **JSON is `String`** columns parsed manually (legacy convention) — migrate to native `Json` deliberately.
- **Local dev URL is `127.0.0.1:51063`, not `localhost`** — `localhost` can resolve to `::1` and trip an "invalid response to SSL negotiation" flake against the container.
- **Hosted Postgres is private-network-only** (correct); there is no TCP proxy. Headless ops go through `/api/admin/ops` (OPS_SECRET), not `railway ssh` (piped stdin is unreliable).

## Shell Execution (gh, op CLIs)
- **child_process**: Use `execAsync` (promisified exec) for CLI calls. Always handle stderr.
- **Input sanitization**: NEVER pass user input directly to shell commands. Use argument arrays or escape properly.
- **Async handling**: CLI calls can be slow. Use proper timeout handling and don't block the event loop.
- **Auth assumption**: Both `gh` and `op` CLIs are assumed pre-authenticated on the developer's machine.

## Anthropic API
- **Server-side only**: NEVER expose ANTHROPIC_API_KEY to client code. All API calls go through API routes.
- **Streaming**: Use the streaming API for the wizard chat to avoid timeout issues on long responses.
- **Rate limits**: Handle 429 errors gracefully with exponential backoff.
- **Model selection**: Default to claude-sonnet-4-6 for the wizard chat (good balance of speed and quality).
- **Context management**: The wizard chat should include relevant knowledge base entries in the system prompt, not in every user message.

## All Stacks
- **File paths**: Use `path.resolve()` and `path.join()` — never string concatenation for paths.
- **Error boundaries**: Use Next.js `error.tsx` files for graceful error handling per route segment.
- **Loading states**: Use `loading.tsx` for route-level loading skeletons.
- **.env.local**: Never commit. Always have .env.example with placeholder values.

## Cloudflare (edge in front of Railway, since 2026-09-16)
- **Why**: Railway never issued a certificate for the `tensixtythree.com` zone (www stuck ISSUING/VALIDATING_OWNERSHIP for 5+ weeks, fresh hostnames too — ticket drafted). Cloudflare is authoritative DNS (GoDaddy stays registrar) and terminates TLS.
- **The Worker is load-bearing**: `infra/cloudflare/edge-worker.ts` (`tensixtythree-edge`, routes `tensixtythree.com/*` + `www.tensixtythree.com/*`) reverse-proxies to `tensixtythree-app-production.up.railway.app` because Railway's edge returns `x-railway-fallback` for hostnames it hasn't validated — a plain proxied CNAME is NOT enough until Railway's cert lands. Apex and any other hostname 301 to `www`. Origin `Location` headers are rewritten back to `www`.
- **Bring-up is a script, not clicks**: `pnpm infra:cloudflare [--dry-run] [--skip-worker]` (`scripts/cloudflare-setup.ts`) is idempotent upsert-only — it never deletes records. Token lives in 1Password `Cascade` → "TenSixtyThree Cloudflare token". DNS truth: `infra/cloudflare/setup.ts#desiredRecords` (Resend + DMARC + GoDaddy pay/domainconnect stay grey-cloud).
- **Order matters**: zone → NS change at GoDaddy → zone `active` → `BETTER_AUTH_URL=https://www.tensixtythree.com` + redeploy web → OAuth callback URLs. Flipping `BETTER_AUTH_URL` before the zone is active breaks sign-in on the railway.app hostname.
- **SSL mode Full (not Strict)**: the origin cert is Railway's `*.up.railway.app`, valid for the origin hostname the Worker fetches, so Full is safe. Never set Flexible (auth cookies are `Secure`).
- **Exit path**: when Railway issues the cert, delete the Worker routes (keep the proxied CNAMEs) and the app is served by Railway's edge directly.
