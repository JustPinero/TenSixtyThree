# Railway support ticket — www.tensixtythree.com cert stuck (draft, 2026-09-04)

**Where to file:** https://station.railway.com → New question
**Title:** Custom domain cert stuck at ISSUING for 3+ weeks — DNS propagated per your own API

---

Custom domain `www.tensixtythree.com` has been stuck since ~2026-08-12 and TLS
still serves the `*.up.railway.app` wildcard cert, so the domain is unusable.

- Project: `tensixtythree` (`f66afbd8-375c-474d-93b4-413787b22230`)
- Service: `tensixtythree-app` (`38ff4468-b3dd-468c-8dfc-6bea77c766b6`), env `production` (`b31315c3-fbff-4049-ac69-66a388b984cd`)
- Custom domain id: `14008c9d-f203-4abb-881a-a1ffbd19b914`

Current state via your GraphQL API (checked 2026-09-04):
- `certificateStatus: CERTIFICATE_STATUS_TYPE_ISSUING` (was `VALIDATING_OWNERSHIP` in August)
- DNS record: `www` CNAME → `9mofxluz.up.railway.app`, `status: DNS_RECORD_STATUS_PROPAGATED`, currentValue matches requiredValue exactly

Details:
- DNS at GoDaddy; no CAA records on the zone.
- The domain was deleted/re-added a few times around Aug 11–12 (suspected
  Let's Encrypt rate-limit backoff), but we have NOT touched it since —
  3+ weeks of waiting with zero churn.
- The service's Railway-provided domain works fine; the app itself is healthy
  (`/api/health` 200).

Ask: please trigger a certificate re-issuance for domain
`14008c9d-f203-4abb-881a-a1ffbd19b914` (or tell us what's blocking issuance
server-side). Happy to delete/re-add once if you confirm that's the right move —
avoiding further churn until advised.
