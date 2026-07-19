# Mobile App Plan — Android + iOS (v1)

> Committed to the repo so it's resumable from any session. Same convention as
> `post-demo-fix-plan-v2.3.md`: update the checkboxes as work lands.

## Progress

- [ ] Phase 0 — API readiness (bearer-token auth, streaming decision)
- [ ] Phase 1 — Expo scaffold + auth + prayer list + journal
- [ ] Phase 2 — Companion chat + topics
- [ ] Phase 3 — Reminders as local notifications + polish
- [ ] Phase 4 — Store builds, review, release (EAS)

---

## Goal

Android and iOS apps with the same functionality as the web app: prayer
wall/journal (unified list), companion AI chat, prayer topics, reminders,
profile/auth. The web app stays the source of truth for business logic — the
mobile apps are **clients of the existing Next.js API** on Lambda, not a
second backend.

## Framework decision: Expo (React Native, managed workflow)

- The team already knows React/TypeScript (whole web app is Next.js + TS), and
  there's prior precedent: commit `5cad0d2` on `main` is an Expo scaffold
  (`GraceToGraceCard`, app.json with Expo slug). It's essentially empty — one
  data file — so v1 starts fresh, but Expo was already the chosen direction.
- **Expo managed + EAS Build/Submit** is the recommendation: no local
  Xcode/Android Studio toolchain needed (builds run on EAS cloud — works even
  from this repo's cloud sessions), over-the-air JS updates via EAS Update,
  first-class push notification and secure storage modules.
- Alternatives considered and rejected for v1:
  - **PWA** (installable web app): cheapest, but no App Store/Play Store
    presence, weak iOS notification support — fails the Consistency pillar
    (reminders are a core value prop).
  - **Capacitor wrap** of the existing Next.js site: fastest to ship but
    webview UX; drag-interactions and streaming chat feel second-class.
  - **Bare React Native**: full native control we don't need yet; slower
    iteration, manual native upgrades.

## Repo layout

`mobile/` directory in this repo (not a separate repo, not a monorepo tool):

```
mobile/
  app/            # expo-router screens (mirrors web routes)
  components/
  lib/api.ts      # typed client for the existing REST API
  lib/types.ts    # request/response types (hand-copied from web for now;
                  # extract a shared package only when drift actually hurts)
  app.json / eas.json
```

---

## Phase 0 — API readiness (small, do first)

The API is already mobile-friendly except for auth:

1. **Bearer-token support** — ✅ **shipped (Sprint 9)**:
   `lib/auth.ts:getUserIdFromRequest` now falls back to the
   `Authorization: Bearer <jwt>` header (same JWT, same verification) when the
   cookie is absent, and `POST /api/auth/login` always returns `{ token }` in
   the JSON body (simpler than a client flag; the body is only readable by a
   caller that just proved it holds valid credentials — web keeps the httpOnly
   cookie and ignores the field). Store it in `expo-secure-store`.
   **Token lifetime decision (G6): 30 days, one lifetime for both transports**
   (`TOKEN_TTL_SECONDS` in `lib/auth.ts`, was 7 days) — weekly forced re-login
   is hostile mobile UX, and a single TTL keeps one code path. A refresh
   endpoint is deliberately deferred until real usage demands it; when it
   comes, it slots into `lib/auth.ts` without changing the transport contract.
2. **CORS**: not needed — native fetch has no browser origin restrictions.
3. **Streaming chat**: decide per Expo SDK capability at build time. Expo SDK
   52+ (`expo/fetch`) supports streaming responses; if it proves flaky on
   device, fall back to the existing non-streaming `generatePrayerChat` shape
   (add `?stream=0` support to `/api/companion/chat` that buffers server-side
   and returns JSON). The topic-prayer endpoint is already non-streaming JSON.
4. **Rate limits already per-user** (`companion:${userId}`), so mobile and web
   share one credit budget automatically.

No schema changes. Deploy Phase 0 to the existing Lambda before Phase 1 ships
to testers.

## Phase 1 — Scaffold + auth + core screens

- `npx create-expo-app` with expo-router + TypeScript; port the design tokens
  (warm paper, evergreen accent, Newsreader/Outfit fonts via `expo-font`).
- Screens: sign in / sign up (email+password against existing endpoints; Google
  OAuth deferred to Phase 3+ — needs `expo-auth-session` and a new redirect
  URI registered per platform), unified prayer+journal list (mirror the web's
  List view — it's now the default on web too and is inherently the right
  mobile layout), journal entry create/edit, profile + reminder settings.
- Token in `expo-secure-store`; `lib/api.ts` attaches the Bearer header.
- Lane moves via the existing tap-to-move pattern (no drag on mobile).

## Phase 2 — Companion + topics

- Topics list/detail: static content can ship inside the app bundle by
  importing the same `lib/prayer-topics/topics.ts` data (copy), calling
  `POST /api/companion/topic-prayer` for generation.
- Companion chat screen + the same page-context idea (topic pages pass their
  verse into `prayerContext`).

## Phase 3 — Reminders + polish

- **Reminders as local notifications first** (`expo-notifications`, scheduled
  daily at the user's configured time/timezone, synced from the existing
  `ReminderSetting` API). No server-side push infrastructure needed for v1 —
  server-sent push (EventBridge → Expo Push API) becomes a later backlog item
  and is what would justify `channel: "push"` actually meaning something.
- Offline behavior: read-only cache of the last overview response
  (AsyncStorage) so the app opens usefully without signal; writes require
  connectivity in v1.

## Phase 4 — Store release

| Item | Cost / lead time |
|---|---|
| Apple Developer Program | $99/year; enrollment can take a few days |
| Google Play Console | $25 one-time |
| EAS Build/Submit | free tier is enough for this cadence |
| App Store review | typically 1–3 days per submission; expect one rejection round on first release (privacy questions re: religious content — prepare the privacy policy link) |
| Play review | hours–days; new-account apps need a 12+ tester / 14-day closed test before production access |

- Privacy: prayer/journal content is religious-beliefs data (GDPR Art. 9 —
  already noted in project-plan.md). Both store listings require a privacy
  policy URL — `/policy` on the live site covers this; review its content
  before submission (existing backlog item P3-7).
- App identity: bundle IDs (e.g. `app.lifengrace.mobile`), icons/splash from
  the quiet design system.

---

## Explicitly deferred (not in v1)

- Google sign-in on mobile (needs per-platform OAuth clients + custom scheme
  redirect URIs; do after the web Google round-trip is human-verified).
- Server-sent push notifications (EventBridge scheduler → Expo Push API).
- Offline writes / sync conflict handling.
- Shared types package (extract only when copy-drift actually bites).
- Tablet/iPad layouts beyond default responsiveness.

## Risks

| Risk | Response |
|---|---|
| Streaming chat unreliable in RN fetch | Fall back to buffered JSON (`?stream=0`) — companion still works, just no typing effect |
| App Store rejection on first pass | Budget a re-submission round; have privacy policy + demo account ready for the reviewer |
| Cookie/Bearer dual auth widens attack surface | Same JWT, same expiry, same verification path — only the transport differs; no new token issuance logic |
| Lambda Function URL churn breaks the app's baked-in API base URL | Ship the API base URL as an EAS Update-able config value, and prioritize the custom-domain backlog item (P3-8) before wide release |
