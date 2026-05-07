# Life-n-Grace — Project Plan

**Version:** 2.0  
**Date:** 2026-05-06  
**Status:** Active  
**Methodology:** Kanban sprints (1-week iterations), ICE prioritization, MoSCoW classification  
**Spec documents:** [auth-spec.md](auth-spec.md) · [apologist-fix-spec.md](apologist-fix-spec.md) · [aws-cicd-spec.md](aws-cicd-spec.md) · [technical-spec.md](technical-spec.md)

---

## 1. Executive Summary

Life-n-Grace is a privacy-first Christian prayer companion app targeting beginner and everyday believers. The core value props are a kanban prayer wall, AES-256-GCM encrypted journals, habit streak tracking, and an AI prayer companion.

**Current RAG Status:** 🟡 Amber  
**Composite health score:** 62/100  
**Reason:** Security gaps (no rate limiting, committed secrets), companion AI broken with placeholder config, no email verification, no OAuth, no production deployment path.

**Goal of this plan:** Fix companion AI immediately (P0), resolve security gaps + ship email verification + Google OAuth within 2 weeks, have CI/CD pipeline + AWS deployment ready by week 4, ship mobile-ready v1.0 by week 8.

### New Workstreams Added (v2.0)

| Workstream | Spec | Priority |
|-----------|------|---------|
| Fix Apologist/companion AI API | [apologist-fix-spec.md](apologist-fix-spec.md) | **P0** — feature is broken |
| Email verification + Google OAuth | [auth-spec.md](auth-spec.md) | **P1** — required before any user acquisition |
| AWS deployment + GitHub Actions CI/CD | [aws-cicd-spec.md](aws-cicd-spec.md) | **P1** — required for production |

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

### P0 — Companion AI Fix (Must Have, ship today)

| # | Item | Impact | Conf | Ease | ICE | Spec |
|---|------|--------|------|------|-----|------|
| P0-AI-1 | Fix Apologist model ID default (`"openai/gpt/4o"` → `"gpt-4o"`), add AbortController timeout, sanitize errors | 9 | 10 | 9 | **9.3** | [apologist-fix-spec.md §3](apologist-fix-spec.md) |
| P0-AI-2 | Migrate companion to Anthropic Claude API (Option B — recommended) | 9 | 9 | 7 | **8.3** | [apologist-fix-spec.md §4](apologist-fix-spec.md) |

> P0-AI-2 unlocks prompt caching (lower cost), streaming, and removes dependency on the placeholder `APOLOGIST_API_URL`.

---

### P0 — Security & Data Integrity (Must Have, ship this week)

| # | Item | Impact | Conf | Ease | ICE | Sprint |
|---|------|--------|------|------|-----|--------|
| P0-1 | Rotate JWT secret + encryption key; replace `.env` values with placeholder strings | 10 | 10 | 10 | **10.0** | S1 |
| P0-2 | Add rate limiting to `/api/auth/login` and `/api/auth/signup` | 10 | 9 | 7 | **8.7** | S1 |
| P0-3 | Stop leaking `error.message` in 500 responses across all routes | 8 | 10 | 9 | **9.0** | S1 |
| P0-4 | Add `DELETE /api/prayers/[id]` and `DELETE /api/journal/[id]` endpoints | 7 | 10 | 8 | **8.3** | S1 |

> **Risk note:** P0-1 is a critical financial/privacy risk. If the `.env` file was ever pushed to a remote repository, treat it as a confirmed breach — rotate immediately regardless of any other priority.

---

### P1 — Auth: Email Verification + Google OAuth (Must Have, weeks 1–2)

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

> **GDPR note:** Prayer content is religious beliefs data (Art. 9 special category). Email verification confirms user identity before storing any personal data. Account deletion is mandatory before any EU launch.

---

### P1 — AWS Deployment + CI/CD (Must Have, weeks 2–3)

| # | Item | Impact | Conf | Ease | ICE | Spec |
|---|------|--------|------|------|-----|------|
| P1-AWS-1 | Create `Dockerfile` + `.dockerignore`; enable `output: "standalone"` in next.config.js | 8 | 10 | 8 | **8.7** | [aws-cicd-spec.md §2](aws-cicd-spec.md) |
| P1-AWS-2 | Scaffold AWS CDK stack (`infra/`): VPC, ECS Fargate, RDS × 2, ALB, Secrets Manager | 9 | 9 | 4 | **7.3** | [aws-cicd-spec.md §3](aws-cicd-spec.md) |
| P1-AWS-3 | Configure AWS SES: verify domain, request production access, set up DKIM | 8 | 9 | 5 | **7.3** | [aws-cicd-spec.md §4](aws-cicd-spec.md) |
| P1-AWS-4 | GitHub Actions CI workflow: typecheck + lint + test + security audit + Trivy scan (on PR) | 9 | 9 | 7 | **8.3** | [aws-cicd-spec.md §5](aws-cicd-spec.md) |
| P1-AWS-5 | GitHub Actions deploy workflow: build → push ECR → ECS rolling update (on merge to main) | 9 | 9 | 6 | **8.0** | [aws-cicd-spec.md §5](aws-cicd-spec.md) |
| P1-AWS-6 | AWS IAM OIDC role for GitHub Actions — no long-lived access keys | 8 | 10 | 7 | **8.3** | [aws-cicd-spec.md §6](aws-cicd-spec.md) |
| P1-AWS-7 | CDK deploy + populate all Secrets Manager values | 8 | 9 | 5 | **7.3** | [aws-cicd-spec.md §8](aws-cicd-spec.md) |

---

### P1 — Architecture Stability (Must Have, weeks 2–3)

| # | Item | Impact | Conf | Ease | ICE | Sprint |
|---|------|--------|------|------|-----|--------|
| P1-1 | Extract `VALID_LANES`, `LANE_TO_LEGACY_STAGE`, `LEGACY_STAGE_TO_LANE` to `lib/prayers/constants.ts` | 6 | 10 | 9 | **8.3** | S2 |
| P1-2 | Add `lib/env.ts` with zod validation of all required env vars at startup | 7 | 9 | 8 | **8.0** | S2 |
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

## 4. Sprint Plan

Context: single-developer cadence, 1-week sprints.

### Sprint 1 — Fix Companion + Security Hardening (Week 1)
**Goal:** Companion works. App is safe to deploy publicly.

| Item | Deliverable |
|------|-------------|
| P0-AI-1 | Fix Apologist API: model ID, timeout, error sanitization |
| P0-AI-2 | Migrate to Anthropic Claude API |
| P0-1 | Rotate secrets; replace `.env` with placeholder-only values |
| P0-2 | Rate limiting on auth endpoints |
| P0-3 | Sanitize all 500 error responses |
| P0-4 | DELETE endpoints for prayers and journals |

**Definition of Done:** Companion chat returns a real response. No credentials in committed files. Auth endpoints return 429 under brute-force load.

---

### Sprint 2 — Auth Overhaul (Week 2)
**Goal:** Email verification working; Google sign-in working.

| Item | Deliverable |
|------|-------------|
| P1-AUTH-2 | Prisma schema updated (emailVerified, Account, Session, VerificationToken) |
| P1-AUTH-1 | Auth.js v5 installed and configured |
| P1-AUTH-3 | Email verification flow (signup → email → verify endpoint) |
| P1-AUTH-4 | `lib/email.ts` with Resend |
| P1-AUTH-5 | Google OAuth provider + login button |
| P1-AUTH-6 | All API routes updated to use Auth.js session |
| P1-AUTH-7 | Middleware updated |
| P1-AUTH-8 | Account deletion endpoint |

**Definition of Done:** New user signs up → receives verification email → clicks link → account activated → can log in with email or Google.

---

### Sprint 3 — Docker + CI Pipeline (Week 3)
**Goal:** App runs in a container; every PR is quality-gated.

| Item | Deliverable |
|------|-------------|
| P1-AWS-1 | Dockerfile + standalone Next.js output |
| P1-AWS-4 | GitHub Actions CI: typecheck + lint + test + audit + Trivy |
| P1-1 | `lib/prayers/constants.ts` extracted |
| P1-2 | `lib/env.ts` zod validation |
| P1-6 | Input length validation |
| P2-5 | Loading/disabled states on buttons |

**Definition of Done:** `docker build` succeeds locally. Every PR triggers the CI workflow. All quality checks pass.

---

### Sprint 4 — AWS Infrastructure + Deploy (Week 4)
**Goal:** App runs on AWS; GitHub merges auto-deploy.

| Item | Deliverable |
|------|-------------|
| P1-AWS-2 | CDK stack: VPC + ECS Fargate + RDS × 2 + ALB + Secrets Manager |
| P1-AWS-3 | AWS SES configured (domain verified + production access) |
| P1-AWS-5 | GitHub Actions deploy workflow (ECR push → ECS rolling update) |
| P1-AWS-6 | AWS IAM OIDC role (no long-lived keys) |
| P1-AWS-7 | All Secrets Manager values populated |
| P1-3 | Auth middleware (protected routes) |

**Definition of Done:** `git push origin main` → CI passes → Docker image pushed to ECR → ECS deploys → app live at production URL with HTTPS.

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
| P2-6 | Error boundary |
| P2-7 | Overview endpoint bounded (take: 200) |

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
| R1 | Committed secrets already scraped by bots | High | Critical | **Avoid** — rotate immediately | P0-1 is blocking |
| R2 | LLM API costs spiral with user growth (no token budget) | Medium | High | **Mitigate** — add per-user usage tracking before P3-3 |
| R3 | Overview endpoint causes DB timeouts as data grows | Medium | Medium | **Mitigate** — P2-7 pagination caps queries |
| R4 | Mobile drag-and-drop breaks core prayer wall UX | High | High | **Mitigate** — P2-3 touch alternative |
| R5 | No social login = high signup abandonment at launch | High | High | **Mitigate** — P3-2 before v1 launch |
| R6 | GDPR/CCPA noncompliance (no delete flow, no privacy policy) | Medium | High | **Mitigate** — P0-4 (delete) + P3-7 (policy) |
| R7 | Single-developer bus factor | High | Medium | **Accept** — document architecture; write tests |

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
