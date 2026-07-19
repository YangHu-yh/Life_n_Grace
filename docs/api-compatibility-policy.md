# API Compatibility Policy

> Sprint 9 / G7 (pulled forward from backlog item P3-5). This policy — not a
> URL prefix — is the deliverable: once the mobile apps ship (Sprint 10+),
> the Next.js API becomes a public contract consumed by binaries we cannot
> redeploy. Web deploys atomically with the API; the apps do not.

## The rule: additive-only

Once the first mobile build reaches testers, every API change must be
**additive**. A change is additive when a client built yesterday keeps working
unmodified today.

**Allowed without ceremony:**
- New routes.
- New *optional* request fields (server must default them when absent).
- New response fields (clients must ignore unknown fields — both the web app
  and the Expo apps use plain `fetch` + `json()`, so they already do).
- New enum values in responses **only** where clients render them generically
  (e.g. a new `syncWarning` string). New values for enums that drive client
  logic (`lane`, journal `status`) count as breaking — mobile switch
  statements won't know them.
- Loosening validation (accepting more than before).

**Breaking — requires the process below:**
- Removing or renaming a route, request field, or response field.
- Changing a field's type, format, or meaning (e.g. `time` "HH:MM" → epoch).
- Tightening validation (rejecting what was previously accepted).
- Changing an error's status code or the shape of the `{ error }` body.
- New *required* request fields.
- Auth changes that invalidate existing tokens or transports (cookie and
  `Authorization: Bearer` are both contract — see `lib/auth.ts`).

## Process for a breaking change

1. Ship the new behavior **alongside** the old (new field next to old field,
   new route next to old route). Never in place.
2. Mark the old surface deprecated here in this file with the date and the
   earliest removal date: **no sooner than 90 days after the store release**
   carrying the replacement, and only when analytics (Sentry breadcrumbs /
   CloudWatch route metrics, Sprint 10's G9 work) show the old surface is
   quiet.
3. Removal is a normal PR that links to the deprecation entry.

## Versioning stance

No `/api/v1` URL prefix for now — with one client team (us) and additive-only
discipline, a prefix adds ceremony without protection. If a wholesale contract
break ever becomes unavoidable, introduce `/api/v2/...` for the new surface
and leave `/api/...` frozen under the deprecation process above; do not
retrofit a `/v1` prefix onto existing routes (that rename would itself be a
breaking change).

## What is already contract (inventory at time of writing)

- **Auth**: `POST /api/auth/{signup,login,logout}`, `GET /api/auth/me`,
  Google OAuth routes, `DELETE /api/auth/account`. Login returns `{ ok,
  token }`; JWT valid 30 days; cookie + Bearer both accepted.
- **Prayers**: `GET/POST/PATCH /api/prayers`, `DELETE /api/prayers/[id]`,
  `GET /api/prayers/overview` (board + journals + `habitSummary`; linked
  journal `status` derives from lane — see post-demo-fix-plan v2.3 §3).
- **Journal**: `GET/POST /api/journal`, `PATCH/DELETE /api/journal/[id]`.
- **Companion**: `POST /api/companion/chat` (text/plain stream; `X-Fallback`
  header on degraded responses), `POST /api/companion/topic-prayer` (JSON).
- **Profile**: `GET/PUT /api/profile`, `POST /api/profile/password`,
  `GET/PUT /api/profile/reminders`, `DELETE /api/profile/reminders/[id]`.
- **Error shape**: non-2xx bodies are `{ "error": string }`; 429s carry
  `Retry-After`.

## Deprecation log

*(empty — add entries here per the process above)*
