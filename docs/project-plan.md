# Life-n-Grace — Project Plan

**Version:** 2.1 — Demo-First Reprioritization  
**Date:** 2026-07-04 (v2.0: 2026-05-06)  
**Status:** Active  
**Methodology:** Kanban sprints (1-week iterations), ICE prioritization, MoSCoW classification  
**Spec documents:** [auth-spec.md](auth-spec.md) · [apologist-fix-spec.md](apologist-fix-spec.md) · [aws-cicd-spec.md](aws-cicd-spec.md) · [technical-spec.md](technical-spec.md)

---

## 1. Executive Summary

Life-n-Grace is a privacy-first Christian prayer companion app targeting beginner and everyday believers. The core value props are a kanban prayer wall, AES-256-GCM encrypted journals, habit streak tracking, and an AI prayer companion.

**Current RAG Status:** 🟡 Amber  
**Composite health score:** 70/100 (was 62 — P0-1 secrets validation, P0-3 error sanitization, and companion API fixes shipped)  
**Reason:** No deployment path yet; no rate limiting; auth is functional but minimal (no email verification/OAuth).

**Goal of this plan (v2.1):** Get a running service on AWS via GitHub Actions CI/CD **as fast as possible** so the product can be demoed to partners. Auth overhaul (email verification + Google OAuth) is explicitly **deferred until after the demo milestone** — the existing JWT auth is sufficient for partner demos.

### v2.1 Reprioritization — Demo-First Strategy

**Decision (2026-07-04):** Deploy-first, auth-later. Rationale:

1. **Partners need a URL, not an auth system.** The existing JWT + bcrypt auth works end-to-end; demo accounts can be provisioned manually.
2. **AWS workstream promoted P1 → P0.** CI/CD + deployment is now the critical path; it was previously gated behind the auth overhaul for no technical reason.
3. **Auth workstream demoted P1 → P2.** Auth.js v5, email verification, Google OAuth, and SES move to post-demo. GDPR account-deletion (P1-AUTH-8) stays earlier because delete endpoints (P0-4) partially cover it.
4. **Demo tier infrastructure = Lambda (decided 2026-07-04).** Deploy the same Docker image to **Lambda + Function URL** for demo/beta: compute rides Lambda's always-free tier (never expires), the Function URL provides HTTPS with no ALB or API Gateway, and a single RDS db.t4g.micro hosts both databases — **~$16/month total**. Fargate + ALB (no free tier, ~$52/month) becomes the **production tier at launch**; the swap is a CDK deploy-target change, not a re-architecture. App Runner was evaluated and rejected — AWS ended new-customer access 2026-04-30. Details in [aws-cicd-spec.md §0](aws-cicd-spec.md). Both Prisma datasources keep separate connection strings — the two-database security boundary is preserved, they just share an instance for now.
5. **Companion AI stays on Apologist** (decision reversed from v2.0's P0-AI-2). The client was rewritten with timeout, URL normalization, SSE streaming, and error sanitization on 2026-07-03.

**Demo-blocking security floor** (cannot skip even for a demo — the ALB URL is public internet):
- Rate limiting on auth endpoints (P0-2)
- DELETE endpoints for user-owned data (P0-4)
- No secrets in code or CI logs (done — `lib/env.ts` validates at startup)

### Workstream Priorities (v2.1)

| Workstream | Spec | Priority |
|-----------|------|---------|
| AWS demo-tier deployment + GitHub Actions CI/CD | [aws-cicd-spec.md](aws-cicd-spec.md) | **P0** — critical path to partner demo |
| Remaining security floor (rate limit, DELETE endpoints) | — | **P0** — ships with or before public URL |
| Demo polish (loading states, error boundary, mobile touch) | — | **P1** — what partners actually see |
| Email verification + Google OAuth | [auth-spec.md](auth-spec.md) | **P2** — deferred to post-demo |
| ~~Fix Apologist/companion AI API~~ | [apologist-fix-spec.md](apologist-fix-spec.md) | ✅ Done 2026-07-03 (stayed on Apologist) |

---

## 2. Prioritization Model

Using **ICE scoring** (best fit: rapid iteration, single-developer, ideation phase).

```
ICE = (Impact + Confidence + Ease) / 3

Impact     1–10  (user/business value if done)
Confidence 1–10  (certainty the item delivers stated impact)
Ease       1–10  (inverse effort: 10 = trivial, 1 = very hard)
```

**MoSCoW legend:**
- **M** — Must Have (P0/P1: blocks production or safety)
- **S** — Should Have (P2: significant value, near-term)
- **C** — Could Have (P3: good-to-have, fits if capacity allows)
- **W** — Won't Have This Cycle (P4: deferred to future)

---

## 3. Full Backlog — Prioritized

### ✅ P0 — Companion AI Fix (DONE 2026-07-03)

| # | Item | Status |
|---|------|--------|
| P0-AI-1 | Fix Apologist model ID default (`"openai/gpt/4o"` → `"gpt-4o"`), AbortController timeout, error sanitization, URL normalization, SSE streaming | ✅ Shipped (commit `837dfb4`) |
| ~~P0-AI-2~~ | ~~Migrate companion to Anthropic Claude API~~ | ❌ Reversed — staying on Apologist (product decision, v2.1) |

---

### P0 — Security Floor (Must Have, ships with or before public URL)

| # | Item | Impact | Conf | Ease | ICE | Status |
|---|------|--------|------|------|-----|--------|
| P0-1 | Startup env validation (`lib/env.ts`); no committed secrets; placeholder detection | 10 | 10 | 10 | **10.0** | ✅ Done (commit `837dfb4`) |
| P0-2 | Add rate limiting to `/api/auth/login` and `/api/auth/signup` | 10 | 9 | 7 | **8.7** | ⬜ Sprint 1 |
| P0-3 | Stop leaking `error.message` in 500 responses across all routes | 8 | 10 | 9 | **9.0** | ✅ Done for auth routes (commit `63813d0`); verify remaining routes in Sprint 1 |
| P0-4 | Add `DELETE /api/prayers/[id]` and `DELETE /api/journal/[id]` endpoints | 7 | 10 | 8 | **8.3** | ⬜ Sprint 1 |

---

### P0 — AWS Demo Deployment + CI/CD (Must Have, weeks 1–2) ⬆ promoted from P1

| # | Item | Impact | Conf | Ease | ICE | Spec |
|---|------|--------|------|------|-----|------|
| P0-AWS-1 | Create `Dockerfile` + `.dockerignore`; enable `output: "standalone"` in next.config.js | 10 | 10 | 8 | **9.3** | [aws-cicd-spec.md §2](aws-cicd-spec.md) |
| P0-AWS-2 | GitHub Actions CI workflow: typecheck + lint + test + audit + Trivy scan (on PR) | 9 | 9 | 7 | **8.3** | [aws-cicd-spec.md §5](aws-cicd-spec.md) |
| P0-AWS-3 | Scaffold **demo-tier** CDK stack (`infra/`): VPC, Lambda (container + Web Adapter) + Function URL, 1× RDS instance (both DBs), Secrets Manager | 10 | 9 | 6 | **8.3** | [aws-cicd-spec.md §0](aws-cicd-spec.md) |
| P0-AWS-4 | AWS IAM OIDC role for GitHub Actions — no long-lived access keys | 8 | 10 | 7 | **8.3** | [aws-cicd-spec.md §6](aws-cicd-spec.md) |
| P0-AWS-5 | GitHub Actions deploy workflow: build → push ECR → `lambda update-function-code` (on merge) | 10 | 9 | 7 | **8.7** | [aws-cicd-spec.md §0](aws-cicd-spec.md) |
| P0-AWS-6 | CDK deploy + populate Secrets Manager (JWT secret, encryption key, `APOLOGIST_*` vars) | 9 | 9 | 5 | **7.7** | [aws-cicd-spec.md §8](aws-cicd-spec.md) |
| P0-AWS-7 | Update aws-cicd-spec env references: `ANTHROPIC_API_KEY`/`NEXTAUTH_*` → `APOLOGIST_API_KEY`/`APOLOGIST_API_URL`; mark SES/Google vars deferred | 7 | 10 | 9 | **8.7** | [aws-cicd-spec.md §8](aws-cicd-spec.md) |

> **Deferred from this workstream:** SES setup (P1-AWS-3 in v2.0) moves to the auth sprint — no email flows exist until email verification ships. CloudFront, WAF, and Multi-AZ move to the production-tier upgrade.

---

### P2 — Auth: Email Verification + Google OAuth ⬇ demoted from P1 (post-demo)

| # | Item | Impact | Conf | Ease | ICE | Spec |
|---|------|--------|------|------|-----|------|
| P1-AUTH-1 | Migrate to Auth.js v5 with Prisma adapter; replace `lib/auth.ts` | 9 | 9 | 5 | **7.7** | [auth-spec.md §4](auth-spec.md) |
| P1-AUTH-2 | Update Prisma schema: `emailVerified`, `Account`, `Session`, `VerificationToken` models | 8 | 10 | 7 | **8.3** | [auth-spec.md §3](auth-spec.md) |
| P1-AUTH-3 | Implement email verification flow (signup → token → verify endpoint) | 9 | 9 | 6 | **8.0** | [auth-spec.md §5](auth-spec.md) |
| P1-AUTH-4 | Build `lib/email.ts` with Resend (dev) + SES (prod) abstraction | 8 | 9 | 7 | **8.0** | [auth-spec.md §6](auth-spec.md) |
| P1-AUTH-5 | Add Google OAuth provider + login page button | 9 | 9 | 6 | **8.0** | [auth-spec.md §7](auth-spec.md) |
| P1-AUTH-6 | Update all API routes: `getUserIdFromRequest` → `auth()` session | 7 | 10 | 6 | **7.7** | [auth-spec.md §9](auth-spec.md) |
| P1-AUTH-7 | Update middleware.ts to use Auth.js middleware export | 7 | 10 | 8 | **8.3** | [auth-spec.md §10](auth-spec.md) |
| P1-AUTH-8 | Implement account deletion endpoint (`DELETE /api/auth/account`) — GDPR Art. 17 | 8 | 10 | 7 | **8.3** | [auth-spec.md §13](auth-spec.md) |

> **GDPR note:** Prayer content is religious beliefs data (Art. 9 special category). Email verification confirms user identity before storing any personal data. Account deletion is mandatory before any EU launch — but P0-4 DELETE endpoints cover the demo period, since demo accounts are provisioned manually for partners, not acquired publicly.

> **Also lands here:** AWS SES setup (formerly P1-AWS-3) — verify domain, production access, DKIM. No email flows exist until this sprint.

---

### P1 — Architecture Stability (weeks 3–4)

| # | Item | Impact | Conf | Ease | ICE | Sprint |
|---|------|--------|------|------|-----|--------|
| P1-1 | Extract `VALID_LANES`, `LANE_TO_LEGACY_STAGE`, `LEGACY_STAGE_TO_LANE` to `lib/prayers/constants.ts` | 6 | 10 | 9 | **8.3** | S2 |
| P1-2 | ~~Add `lib/env.ts` with validation of all required env vars at startup~~ ✅ Done (commit `837dfb4`, plain TS — zod optional later) | 7 | 9 | 8 | **8.0** | ✅ |
| P1-3 | Add `middleware.ts` for route-level auth protection (redirect unauthenticated users away from `/prayers`, `/companion`, `/profile`) | 8 | 9 | 7 | **8.0** | S2 |
| P1-4 | Split `PATCH /api/prayers` into `PATCH /api/prayers/[id]` (lane update) + `POST /api/prayers/[id]/prayed` (prayer event) | 7 | 9 | 6 | **7.3** | S2 |
| P1-5 | Add `limit` + `cursor` pagination to `GET /api/prayers`, `GET /api/journal` | 7 | 8 | 6 | **7.0** | S3 |
| P1-6 | Add input validation: max length on `topic` (500), `content` (50 000), `notes` (2000) | 6 | 9 | 8 | **7.7** | S2 |
| P1-7 | Retire legacy `PrayerStage` enum via schema migration; remove all stage↔lane translation code | 6 | 8 | 5 | **6.3** | S3 |
| P1-8 | Replace `useEffect`+`fetch` with SWR across all pages | 8 | 8 | 6 | **7.3** | S3 |

---

### P2 — Product Quality (Should Have, weeks 3–6)

| # | Item | Impact | Conf | Ease | ICE | Sprint |
|---|------|--------|------|------|-----|--------|
| P2-1 | Decompose `prayers/page.tsx` (714 lines) into `<PrayerWall>`, `<JournalWorkspace>`, `<JournalModal>`, `<HabitSummary>` | 7 | 9 | 6 | **7.3** | S3 |
| P2-2 | Add optimistic updates for lane moves and mark-prayed (no full reload) | 8 | 8 | 5 | **7.0** | S4 |
| P2-3 | Mobile-first prayer card interactions: tap-to-select → tap-lane-to-move (drag-and-drop doesn't work on touch) | 9 | 9 | 5 | **7.7** | S4 |
| P2-4 | Wire up Reminder Settings UI (model + API route already exist, no frontend) | 7 | 9 | 6 | **7.3** | S4 |
| P2-5 | Add loading/disabled states on all form submit buttons (prevent double-submit) | 6 | 10 | 9 | **8.3** | S3 |
| P2-6 | Add error boundary in the frontend | 5 | 9 | 8 | **7.3** | S3 |
| P2-7 | Optimize `/api/prayers/overview` — add server-side aggregation, cap unbounded queries with `take: 200` | 8 | 8 | 6 | **7.3** | S3 |
| P2-8 | Add first-run onboarding flow (empty state → guided first prayer wizard) | 8 | 7 | 5 | **6.7** | S5 |
| P2-9 | Write core unit tests: `lib/security/encryption.ts`, `lib/auth.ts`, prayer CRUD routes | 7 | 9 | 6 | **7.3** | S4 |

---

### P3 — Strategic Features (Could Have, weeks 6–10)

| # | Item | Impact | Conf | Ease | ICE | Sprint |
|---|------|--------|------|------|-----|--------|
| P3-1 | Integrate companion chat with prayer context (pre-load prayer topic into system prompt when opened from a card) | 9 | 8 | 6 | **7.7** | S5 |
| P3-2 | Add social login via Auth.js (Google + Apple Sign-In) | 9 | 8 | 5 | **7.3** | S6 |
| P3-3 | Add monetization gate: free tier (10 companion messages/month), Pro tier (unlimited) | 9 | 7 | 4 | **6.7** | S6 |
| P3-4 | Set up CI pipeline (GitHub Actions): lint + typecheck + test on every push | 7 | 9 | 7 | **7.7** | S5 |
| P3-5 | Add API versioning (`/api/v1/`) via Next.js route groups | 5 | 8 | 6 | **6.3** | S6 |
| P3-6 | Add streak celebration UI (milestone cards at 7, 30, 100 days) | 7 | 7 | 6 | **6.7** | S7 |
| P3-7 | Add privacy policy page and cookie notice (required before any public launch) | 8 | 10 | 7 | **8.3** | S5 |

> `app/policy/page.tsx` already exists — verify content is legally sufficient.

---

### P4 — Deferred (Won't Have This Cycle)

| # | Item | Reason |
|---|------|--------|
| P4-1 | OpenAPI/Swagger spec generation | Lower leverage than fixing the routes themselves |
| P4-2 | GraphQL layer | REST is sufficient at this scale |
| P4-3 | Social/community prayer sharing | Requires moderation infrastructure |
| P4-4 | Native mobile app (React Native) | Web-first until product-market fit proven |
| P4-5 | Merge dual databases into one | Acceptable risk tradeoff; keep as architectural decision |
| P4-6 | HATEOAS `_links` | Over-engineered for this API surface |

---

## 4. Sprint Plan (v2.1 — Demo-First)

Context: single-developer cadence, 1-week sprints. **Milestone: partner-demoable URL at end of Sprint 2.**

### Sprint 1 — Containerize + CI + Security Floor (Week 1)
**Goal:** App builds as a container; every PR is quality-gated; safe to expose publicly.

| Item | Deliverable |
|------|-------------|
| P0-AWS-1 | Dockerfile + `.dockerignore` + standalone Next.js output |
| P0-AWS-2 | GitHub Actions CI: typecheck + lint + test + audit + Trivy |
| P0-AWS-7 | aws-cicd-spec env vars corrected (`APOLOGIST_*`, defer SES/Google) |
| P0-2 | Rate limiting on auth endpoints |
| P0-4 | DELETE endpoints for prayers and journals |
| P0-3 | Verify error sanitization on remaining (non-auth) routes |

**Definition of Done:** `docker build` succeeds locally and container runs against local Postgres. CI passes on a test PR. Auth endpoints return 429 under brute-force load.

---

### Sprint 2 — AWS Demo Tier Live on Lambda (Week 2) 🎯 DEMO MILESTONE
**Goal:** `git push origin main` → app live on AWS at an HTTPS URL you can send to partners, at ~$16/month.

| Item | Deliverable |
|------|-------------|
| P0-AWS-3 | Demo-tier CDK stack: VPC + Lambda (container + Web Adapter, streaming) + Function URL + 1 RDS instance (both DBs) + Secrets Manager |
| P0-AWS-4 | AWS IAM OIDC role (no long-lived keys) |
| P0-AWS-5 | Deploy workflow: ECR push → `lambda update-function-code` |
| P0-AWS-6 | Secrets populated (JWT, encryption key); `APOLOGIST_*` left **unset** until key provided → companion shows "not yet available" |
| — | Prisma migrations run from CI; provision partner demo accounts manually; seed demo prayer data |

**Definition of Done:** Merge to main auto-deploys. App live at the Function URL with HTTPS. Partner can log in with a provisioned account on their phone. Compute bill: $0 (always-free tier).

> **When the Apologist key arrives:** add NAT (t4g.nano instance ~$4/mo) for Lambda outbound internet, set `APOLOGIST_*` in Secrets Manager, redeploy — companion streams live.

---

### Sprint 3 — Demo Polish (Week 3)
**Goal:** The demo *feels* good — especially on a partner's phone.

| Item | Deliverable |
|------|-------------|
| P2-3 | Touch-friendly prayer card interaction (tap-to-select → tap-lane-to-move) |
| P2-5 | Loading/disabled states on all submit buttons |
| P2-6 | Error boundary in the frontend |
| P1-3 | Route-level auth middleware (redirect unauthenticated users) |
| P1-6 | Input length validation |
| P3-7 | Privacy policy content review (partners will ask) |

**Definition of Done:** Prayer wall fully usable on mobile Safari/Chrome. No dead-end error screens. Policy page credible.

---

### Sprint 4 — Auth Overhaul (Week 4, post-demo)
**Goal:** Email verification working; Google sign-in working. (Moved from v2.0 Sprint 2.)

> **Phase A shipped 2026-07-05** ([auth-spec v1.1](auth-spec.md)): P2-AUTH-2 schema,
> P2-AUTH-3 verification flow (on existing JWT auth; auto-verify until an email
> provider is configured), P2-AUTH-4 lib/email.ts, P2-AUTH-8 account deletion +
> profile UI. **Phase B pending user credentials** (Google OAuth + Resend/SES):
> P2-AUTH-1/5/6/7 Auth.js v5 migration — deliberately deferred so the auth
> backbone swap is verified against a real login, not just typecheck.

| Item | Deliverable |
|------|-------------|
| P2-AUTH-2 | Prisma schema updated (emailVerified, Account, Session, VerificationToken) |
| P2-AUTH-1 | Auth.js v5 installed and configured |
| P2-AUTH-3 | Email verification flow (signup → email → verify endpoint) |
| P2-AUTH-4 | `lib/email.ts` with Resend (dev) + SES (prod) |
| — | AWS SES: domain verified, production access, DKIM |
| P2-AUTH-5 | Google OAuth provider + login button |
| P2-AUTH-6 | All API routes updated to use Auth.js session |
| P2-AUTH-7 | Middleware updated |
| P2-AUTH-8 | Account deletion endpoint |

**Definition of Done:** New user signs up → receives verification email → clicks link → account activated → can log in with email or Google.

---

### Sprint 5 — Architecture Cleanup + Performance (Week 5)
**Goal:** Clean codebase; paginated APIs; SWR.

| Item | Deliverable |
|------|-------------|
| P1-4 | Split PATCH prayer route into lane-update + prayed-action |
| P1-5 | Cursor pagination on list endpoints |
| P1-7 | PrayerStage enum retired |
| P1-8 | SWR replaces manual fetch/useEffect |
| P2-1 | `prayers/page.tsx` decomposed into sub-components |
| P2-7 | Overview endpoint bounded (take: 200) |
| — | Production-tier infra upgrade: Multi-AZ RDS, 2nd Fargate task, CloudFront, WAF (as user traffic warrants) |

**Definition of Done:** `tsc --noEmit` passes. No component file >300 lines. Overview endpoint response time <500ms.

---

### Sprint 6 — Mobile + Tests (Week 6)
**Goal:** Core UX works on mobile; core lib tested.

| Item | Deliverable |
|------|-------------|
| P2-2 | Optimistic updates for lane moves and mark-prayed |
| P2-3 | Touch-friendly card interaction for mobile |
| P2-4 | Reminder settings UI |
| P2-9 | Core unit tests: encryption, auth, prayer CRUD |

**Definition of Done:** Prayer wall usable on mobile Safari/Chrome. Test coverage ≥60% on `lib/`.

---

### Sprint 7 — Product Polish + Monetization (Week 7–8)
**Goal:** First-run experience; prayer-context AI; monetization gate.

| Item | Deliverable |
|------|-------------|
| P2-8 | Onboarding flow |
| P3-1 | Prayer-context companion integration |
| P3-3 | Companion usage gate (10 free/month → Pro) |
| P3-6 | Streak celebration milestones |
| P3-7 | Privacy policy review (includes GDPR Art. 9 language for prayer content) |

**Definition of Done:** New users see guided flow. Companion is pre-loaded with prayer context when opened from a card. Companion returns 402 after free limit.

---

## 5. Risk Register

| ID | Risk | Probability | Impact | Score | Response |
|----|------|------------|--------|-------|---------|
| R1 | ~~Committed secrets already scraped by bots~~ | — | — | ✅ **Closed 2026-07-03** — git history verified clean; `lib/env.ts` blocks placeholder values at startup |
| R2 | LLM API costs spiral with user growth (no token budget) | Medium | High | **Mitigate** — add per-user usage tracking before P3-3 |
| R3 | Overview endpoint causes DB timeouts as data grows | Medium | Medium | **Mitigate** — P2-7 pagination caps queries |
| R4 | Mobile drag-and-drop breaks core prayer wall UX during partner demos | High | High | **Mitigate** — P2-3 touch alternative moved into Sprint 3 (pre-demo-polish) |
| R5 | No social login = high signup abandonment at launch | High | High | **Mitigate** — P3-2 before public v1 launch (not needed for demos) |
| R6 | GDPR/CCPA noncompliance (no delete flow, no privacy policy) | Medium | High | **Mitigate** — P0-4 (delete) in Sprint 1 + P3-7 (policy) in Sprint 3 |
| R7 | Single-developer bus factor | High | Medium | **Accept** — document architecture; write tests |
| R8 | Public demo URL exposed with minimal auth (no email verification, no MFA) | Medium | High | **Mitigate** — rate limiting (P0-2) before URL exists; manually provisioned demo accounts only; auth overhaul in Sprint 4 before any public signup push |
| R9 | Demo-tier single-instance RDS = no failover during a partner demo | Low | Medium | **Accept** for demo period — 7-day backups on; upgrade to Multi-AZ in production-tier upgrade (Sprint 5+) |
| R10 | Lambda cold start (~2–4s) on first request in front of a partner | Medium | Low | **Mitigate** — warm the app before handing over; provisioned concurrency (1 instance) for demo hours if needed |
| R11 | Companion feature dark until Apologist key + NAT are added (Lambda has no outbound internet in VPC) | High (short-term) | Medium | **Accept** knowingly — route already returns a friendly "not yet available"; activation is a documented 3-step change (NAT, secrets, redeploy) |

---

## 6. Definition of Done (Project-Wide)

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] All P0 items shipped and verified
- [ ] No real credentials in any committed file
- [ ] Auth endpoints rate-limited
- [ ] DELETE endpoints exist for all user-owned resources
- [ ] Core lib tests pass (encryption, auth, prayer CRUD)
- [ ] Mobile prayer lane movement works without drag-and-drop
- [ ] CI pipeline runs on every PR

---

## 7. Success Metrics (6-week checkpoint)

| Metric | Target |
|--------|--------|
| Security score | 0 critical, 0 high issues |
| Test coverage (lib/) | ≥ 60% |
| Lighthouse mobile performance | ≥ 75 |
| API response P95 (overview endpoint) | < 500 ms |
| Signup conversion (landing → account) | > 30% |
| Day-7 retention | > 20% |
| Companion messages / user / week | > 3 (engagement signal) |
