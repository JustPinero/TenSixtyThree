# Phase 56 — Edge hardening: ship 1.0.1, lock the zone, close the Worker gaps

Justin (2026-09-27): "layout phases to address all of these issues."
Source: the 2026-09-18 audit (Cloudflare edge review + hosted-state audit)
and the 09-22 sign-in lockout. Cloudflare is live (www canonical) but the
proxy-aware IP fix is merged (7daa6e7) and NOT deployed; the zone runs on
Cloudflare defaults; the Worker has known edge cases.

## 56.1 — Roll out 1.0.1 (ORDER MATTERS; needs default permission mode)
1. Worker binding: `EDGE_SHARED_SECRET=$(op read "op://Cascade/TenSixtyThree
   EDGE_SHARED_SECRET prod/password") CLOUDFLARE_API_TOKEN=$(op read
   "op://Cascade/TenSixtyThree Cloudflare token/credential") pnpm exec tsx
   scripts/cloudflare-setup.ts` → verify www /signin 200.
2. `railway up --service tensixtythree-app --ci` → SUCCESS → www 200,
   origin-direct still 200 (var unset = no gate yet).
3. `railway variables --service tensixtythree-app --set EDGE_SHARED_SECRET=…`
   (auto-deploys) → origin-direct /signin = 403, /api/health = 200, www 200.
4. Smoke: demo mint ×2 from one IP (second is 200, not 429 from a shared
   bucket), OTP send from www 200, foreign Origin 403, SSE stream.
Rollback = unset the var. Handoff + landmines already document the order.

## 56.2 — Zone + app hardening
- Cloudflare (extend scripts/cloudflare-setup.ts `ensureSettings`):
  min_tls_version=1.2, security_header (HSTS on, max_age 15552000,
  include_subdomains false until app./pay. are reviewed, preload off),
  email_obfuscation=off (injects script into Next HTML — hydration risk),
  0rtt stays off. Idempotent; PATCH only when value differs.
- next.config.ts: `poweredByHeader: false`; `headers()` →
  X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin,
  X-Frame-Options DENY (dashboard is never framed), Permissions-Policy
  minimal. CSP deferred to its own request (Next inline scripts need nonces).
- Cache: /signin ships `s-maxage=31536000` (Next static prerender). Confirm
  the page has no per-request data; otherwise mark it dynamic.

## 56.3 — Worker + setup-script edge cases (from the 09-18 review)
- edge-worker.ts: status 101 → return upstream as-is; null-body statuses
  (204/205/304) → body null; rewrite `refresh` and `content-location` too;
  match `https?://<origin host>` not just the https ORIGIN string.
- scripts/cloudflare-setup.ts: `cf()` reads text() and try-parses (surface
  HTTP status + first 200 chars on non-JSON); paginate dns_records via
  result_info.total_pages; ACCOUNT_ID env override with default.
- infra/cloudflare/setup.ts: DMARC `rua=` → a Coqui Labs mailbox (GoDaddy's
  onsecureserver.net is a leftover).

## AC → tests
- 56.1: live smoke checklist above recorded in handoff (no unit tests —
  ops). `middleware.test.ts` already covers gate/IP; add a route-level test
  that /api/demo keyed on x-client-ip does NOT 429 a second distinct IP.
- 56.2a `ensureSettings` planner: pure `desiredZoneSettings()` +
  `planSettingChanges(current, desired)` → unit tests (no-op when equal,
  patch list when different) in infra/cloudflare/setup.test.ts.
- 56.2b next.config headers: test that `headers()` returns the five
  headers for `/(.*)` and poweredByHeader is false.
- 56.3a Worker: tests for 101 passthrough, 204/304 null body, Refresh +
  Content-Location rewrite, http:// origin Location, HEAD, non-2xx body
  passthrough (401 JSON), multiple Set-Cookie preserved, client-supplied
  x-forwarded-for left for the origin to ignore.
- 56.3b setup: `cf()` non-JSON error path (mock fetch → 502 HTML) yields a
  message containing the status; pagination merges pages.
- 56.3c DMARC record content asserted in desiredRecords test.
