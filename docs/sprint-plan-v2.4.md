# Sprint Plan v2.4 — Close All Gaps (Post-Demo → Store Launch)

> Product-vision review + sprint-by-sprint execution plan. Written applying the
> C-suite/product-vision + PM discipline the user requested (the claude-skills
> C-level/PM skills live on the user's local machine; methodology applied
> directly here). Companion to `project-plan.md` (v2.3 backlog/IDs still
> canonical) and `mobile-app-plan.md` (phases referenced below).
> Cadence: 1-week sprints, single developer, continuing project-plan numbering.

## Direction adjustments (the "why" before the "what")

Measured against the mission-statement pillars — **Consistency**, **Visualize
Faithfulness**, **Suggest Scripture** — the current direction has four
misalignments this plan corrects:

1. **Reminders don't remind (pillar 1 is a settings form).** Verified in code:
   `ReminderSetting` is touched only by the profile CRUD routes — no scheduler,
   no delivery, on any channel. Everything else shipped (wall/journal
   consistency, topics, companion) serves pillars 2–3; the *first* pillar has
   no working feature. **Adjustment: reminder delivery becomes the top product
   priority (Sprint 9), ahead of all mobile UI work.** Mobile Phase 3's local
   notifications become the *second* delivery channel, not the first.
2. **Sequencing inversion: custom domain before mobile, not after.** P3-8 was
   filed as low-priority backlog, but mobile apps bake the API base URL into
   shipped binaries, and Google's OAuth redirect URI is registered against the
   current Function URL. Recreating the Lambda stack after apps ship would
   strand both. **Adjustment: P3-8 moves to Sprint 8, before any mobile code.**
   It also unblocks SES domain identity (Sprint 9's email delivery).
3. **Cost floor before scale surface (R2).** The Django prototype had a
   per-user daily AI quota (`DailyGenerationQuota`, 10/day); the Next.js
   rewrite ported only burst rate-limiting (20 / 5 min). Store launch multiplies
   call sites and users on an unmetered Apologist budget. **Adjustment: port
   the daily quota + usage counter (Sprint 11) before the store release sprint;
   the P3-3 paywall stays deferred — measurement first, monetization later.**
4. **The survey is a feedback loop, not a memo.** The mission-statement survey
   to ministry contacts frames this whole reprioritization, but nothing in any
   plan consumes its results. **Adjustment: a survey-results checkpoint gates
   Sprint 11+ scope — 30 minutes at Sprint 10 review to re-rank remaining
   sprints against what ministry contacts actually said.** Cheap insurance
   against building six weeks in the wrong direction.

**Explicitly unchanged:** demo-tier infrastructure (~$20/mo) until store-launch
traction data says otherwise; Expo/EAS mobile strategy; the dual-database
security boundary; ICE prioritization.

---

## Gap register (everything open, with disposition)

| # | Gap | Source | Disposition |
|---|-----|--------|-------------|
| G1 | Latest merged fixes (prompt overhaul, workspace removal, kanban default) not deployed | this session | Sprint 8 |
| G2 | Google consent click-through never human-verified | v2.3 plan §2 | Sprint 8 (human, ~10 min) |
| G3 | Function URL fragility (R12) / no custom domain (P3-8) | project-plan | Sprint 8 |
| G4 | Privacy policy content unreviewed (P3-7) — blocks store listings too | project-plan | Sprint 8 (human review) |
| G5 | **Reminders never delivered** — no scheduler, no send, any channel | this review | Sprint 9 |
| G6 | Mobile Phase 0: cookie-only auth; no token-lifetime/refresh decision | mobile plan review | Sprint 9 |
| G7 | API becomes a public contract once apps ship; no versioning/compat policy (P3-5) | mobile plan review | Sprint 9 (policy doc, additive-only rule) |
| G8 | Mobile Phase 1 (scaffold, auth, core screens) | mobile plan | Sprint 10 |
| G9 | No crash reporting/analytics anywhere (web or mobile) | mobile plan review | Sprint 10 |
| G10 | Store account lead times (Apple days, Play 14-day closed test) | mobile plan | Sprint 10 (start clocks early) |
| G11 | Mobile Phase 2 (companion + topics; streaming-on-device decision) | mobile plan | Sprint 11 |
| G12 | No daily AI usage quota / per-user usage metering (R2 regression vs Django) | this review | Sprint 11 |
| G13 | Survey results never consumed by planning | this review | Checkpoint at Sprint 10 review |
| G14 | Mobile Phase 3 (local notifications incl. timezone rule, offline read cache) | mobile plan | Sprint 12 |
| G15 | No frontend error boundary (P2-6) | project-plan | Sprint 12 |
| G16 | Mobile Phase 4 (store listings, review, release) | mobile plan | Sprint 13 |
| G17 | RDS ~85-connection ceiling, no pooler, no alarm | cost/capacity analysis | Sprint 13 (alarm now, pooler decision gated on data) |
| G18 | First-run onboarding (P2-8) — store users arrive cold | project-plan | Sprint 13 stretch |
| G19 | Internal-quality refactors: P1-5 pagination, P1-7 enum retirement, P1-8 SWR, P2-1 decomposition | project-plan | Post-plan backlog (unchanged) |
| G20 | Monetization gate (P3-3), streak celebrations (P3-6), Apple sign-in, server push | project-plan / mobile plan | Post-plan backlog (unchanged) |

---

## Sprint 8 — Ship & Stabilize the Ground (Week 1)

**Goal:** everything already merged is live; the URL and legal surfaces that
mobile will depend on stop moving.

| Item | Gap | Notes |
|------|-----|-------|
| Deploy `typescript_Nextjs` to Lambda (image rebuild + `update-function-code`) | G1 | No schema change this round |
| Live smoke: topic-prayer endpoint output quality with real Apologist; kanban default; workspace section gone | G1 | |
| **Human:** Google consent click-through on the live URL | G2 | Only remaining human verification from v2.3 |
| Custom domain: Route53 + CloudFront in front of the Function URL; re-register Google redirect URI against it; update `APP_BASE_URL` | G3 | Kills R12; prerequisite for SES (S9) and mobile base URL (S10) |
| **Human:** review `/policy` content (GDPR Art. 9 language) | G4 | Also required by both app stores in S13 |

**DoD:** live app serves all merged work from the custom domain; Google
sign-in round-trip verified by a human; policy page approved.

## Sprint 9 — Make Reminders Real + API Contract (Week 2)

**Goal:** pillar 1 exists; the API is ready to have clients that can't be
redeployed.

| Item | Gap | Notes |
|------|-----|-------|
| Reminder email delivery: EventBridge Scheduler → Lambda (or scheduled Lambda cron) reads due `ReminderSetting`s (time+timezone), sends via existing `lib/email.ts`; SES domain identity on the new custom domain | G5 | Idempotency guard (one send per reminder per day); respect `enabled` |
| Bearer-token auth fallback in `lib/auth.ts` + token in login response body | G6 | Same JWT/verification; transport only |
| Token lifetime decision: mobile-length expiry or refresh endpoint — decide and implement | G6 | Write the decision into mobile-app-plan Phase 0 |
| API compatibility policy: additive-only changes once mobile ships; document in `docs/` (full `/api/v1` prefix optional, policy is the deliverable) | G7 | Pulled forward from P3-5 |

**DoD:** a real inbox receives a reminder at the configured local time;
`curl` with `Authorization: Bearer` works against every API route; compat
policy committed.

## Sprint 10 — Mobile Foundation (Week 3)

**Goal:** the app exists on both platforms; the slow store clocks are running.

| Item | Gap | Notes |
|------|-----|-------|
| Mobile Phase 1: Expo scaffold in `mobile/`, secure-store auth, unified prayer+journal list, journal CRUD, profile/reminder settings | G8 | Per mobile-app-plan |
| Sentry: mobile app + web (Lambda) in the same project | G9 | Before testers, not after |
| **Start store clocks:** Apple Developer enrollment; Play Console + begin the 12-tester/14-day closed test with the rough build | G10 | Longest external lead times in the plan |
| **Checkpoint: survey results review** — re-rank Sprints 11–13 against ministry-contact feedback | G13 | 30 min at sprint review; adjust before Phase 2 build |

**DoD:** dev build runs on an iPhone and an Android device; crash from either
appears in Sentry; both store enrollments submitted; survey verdict recorded.

## Sprint 11 — Mobile Companion + Cost Floor (Week 4)

**Goal:** feature parity on AI surfaces, with the spend metered before scale.

| Item | Gap | Notes |
|------|-----|-------|
| Mobile Phase 2: topics screens (bundled catalog + `topic-prayer` endpoint), companion chat; settle streaming vs `?stream=0` on real devices | G11 | |
| Port the daily AI quota: per-user daily counter (Prisma model, main DB) checked by both companion routes; env-configurable limit (default 10/day like Django); usage visible in CloudWatch metrics | G12 | Measurement + cap only — no paywall (P3-3 stays deferred) |

**DoD:** companion + topics usable in the app; 11th generation of the day
politely refuses on web and mobile; daily usage graphable.

## Sprint 12 — Mobile Reminders + Resilience (Week 5)

**Goal:** pillar 1 on device; both clients degrade gracefully.

| Item | Gap | Notes |
|------|-----|-------|
| Mobile Phase 3: `expo-notifications` daily local reminders synced from `ReminderSetting`; **timezone rule: follow the device, write the device tz back to the setting on sync** | G14 | Rule decided here so email (server) and local (device) reminders agree |
| Offline read cache of last overview (AsyncStorage) | G14 | Writes still require connectivity |
| Web error boundary (P2-6) | G15 | Last cheap pre-launch web polish item |
| TestFlight external build to testers | G10 | Feedback window before S13 submission |

**DoD:** reminder fires on a real device with the app closed; airplane-mode
open shows cached prayers; a thrown render error shows a friendly recovery
screen on web.

## Sprint 13 — Store Launch + Scale Guardrails (Week 6)

**Goal:** apps live in both stores; the known ceiling is monitored.

| Item | Gap | Notes |
|------|-----|-------|
| Mobile Phase 4: listings (privacy policy URL from S8, screenshots, data-safety forms), submit, absorb one review round, release | G16 | Play closed test (started S10) satisfies the 14-day rule by now |
| RDS guardrail: CloudWatch alarm on `DatabaseConnections` (~60 threshold); pooler (RDS Proxy vs PgBouncer) decided only if the alarm ever fires | G17 | Cheapest correct response to the ~85-connection ceiling |
| Stretch: first-run onboarding wizard (P2-8) | G18 | Store users arrive with zero context; cut first if the sprint runs hot |

**DoD:** both stores show the app publicly; connection alarm armed; launch
retro written (feeds the next plan version).

---

## Explicitly still deferred after Sprint 13 (unchanged from prior plans)

P1-5 pagination · P1-7 enum retirement · P1-8 SWR · P2-1 page decomposition ·
P3-3 paywall (quota data from S11 informs it) · P3-6 streak celebrations ·
Apple sign-in · server-sent push (EventBridge → Expo Push) · offline writes ·
Fargate production tier (gated on real traffic, not calendar).

## Risks to this plan

| Risk | Response |
|------|----------|
| Single developer, 6 sprints, external store clocks | The only hard-sequenced externals start in S10; everything after can slip a week without breaking dependencies |
| Survey feedback contradicts mobile priority | That's the point of the S10 checkpoint — S11–13 re-rankable; S8–9 are direction-proof (they fix shipped-feature integrity) |
| Reminder scheduler adds always-on cost | EventBridge Scheduler + short Lambda runs stay in always-free tiers at this scale |
| Apologist quota annoys real heavy users | 429 copy invites them to tomorrow; limit is env-configurable without redeploy of logic |
