# Life-n-Grace — Partner Handoff

> Everything you need to pick this project up: what it is, what's live, where
> the code stands, how to run it, and what happens next. Written 2026-07-24.
> The companion docs referenced here all live in `docs/`.

## What this is

A privacy-first Christian prayer companion (web now, mobile in progress)
built around three pillars: **Consistency** (daily reminders), **Visualize
Faithfulness** (a kanban prayer wall + encrypted journal that stay in sync),
and **Suggest Scripture** (curated + AI-suggested verses per topic, and an AI
prayer companion). Single Next.js app + API on AWS Lambda, two Postgres
databases (main + encrypted journal — a deliberate security boundary), AI via
the Apologist Fusion API.

- **Live demo**: https://v6flaqacud5cunfhg34hiqtkci0zpbpn.lambda-url.us-east-1.on.aws/
- **Domain acquired, not yet cut over**: `lifengrace.com` (runbook ready)
- **Repo**: github.com/YangHu-yh/Life_n_Grace — `main` is the development
  branch; `claude/life-n-grace-post-demo-ugauw8` currently carries newer
  unmerged work (see "Where the code stands").

## Where the code stands (three layers, newest first)

1. **Branch `claude/life-n-grace-post-demo-ugauw8`** (ahead of `main`, ready
   to merge): reminder **email delivery** (EventBridge cron), bearer-token
   auth for mobile (30-day JWT), per-user daily AI quota (10/day), SMTP email
   provider (temp Gmail now, SES later — config-only swap), **10 curated
   verses per topic + AI "Find more verses" library**, an SSE stream bugfix,
   the **Expo mobile app Phase 1** (`mobile/`), API compatibility policy,
   CloudFront/custom-domain infrastructure code.
2. **`main`** (merged, NOT yet deployed): topic-prayer prompt overhaul (fixes
   the error seen in the last demo), workspace-section removal, Wall/List
   toggle, sprint plan v2.4.
3. **Deployed Lambda** (STALE — runs code from before both of the above):
   still has the topic-prayer error. **The single most valuable next action
   is one deploy session** — see below.

## Key documents (read in this order)

| Doc | What it is |
|---|---|
| `docs/sprint-plan-v2.4.md` | The ACTIVE plan: gap register G1–G20, Sprints 8–13 (post-demo → store launch), live Status section |
| `docs/decision-register.md` | Settled decisions (don't re-litigate), open owner decisions, partner agenda |
| `docs/mobile-app-plan.md` | Mobile phases 0–4; Phase 1 is code-complete in `mobile/` |
| `DEPLOYMENT.md` | Deploy runbooks incl. **"Custom domain cutover"** and **"Changing the sender email"** |
| `docs/api-compatibility-policy.md` | API is additive-only once mobile ships |
| `docs/project-plan.md`, `docs/post-demo-fix-plan-v2.3.md` | History + backlog IDs the sprint plan references |

## Run it locally (10 minutes)

```bash
git clone <repo> && cd Life_n_Grace
npm ci && npm run prisma:generate
# Postgres 16 with two databases; copy config/env.example -> .env and fill it
npx prisma db push --schema prisma/main/schema.prisma
npx prisma db push --schema prisma/journal/schema.prisma
npm run dev              # web on :3000
npm run typecheck && npm run lint   # the always-required checks
# mobile:
cd mobile && npm install && npx expo start   # scan QR with Expo Go
```

No email provider configured = signups auto-verify (fine for dev). The
companion AI needs `APOLOGIST_*` env values or it serves fallback prayers.

## The immediate to-do: one AWS deploy session

Order matters (details in the sprint plan Status section + DEPLOYMENT.md):

1. Merge the `claude/...` branch into `main` (fast-forward).
2. Add to the `life-n-grace/app` Secrets Manager secret **before**
   `cdk deploy`: `REMINDER_CRON_SECRET` + the six `EMAIL_*`/`SMTP_*` keys
   (temp Gmail app password for real email, or empty strings for off).
3. `prisma db push` against RDS (adds `lastSentAt`, `DailyAiUsage`,
   `TopicVerse`).
4. `cdk deploy`, then docker image rebuild + `aws lambda
   update-function-code` (a plain `cdk deploy` does NOT pick up new images
   or changed secret values).
5. Optional same-session upgrades: domain cutover to `lifengrace.com`,
   `npm run seed:demo` for a lived-in demo account, bump `AI_DAILY_LIMIT`
   for demo day.

## Decisions that need the two of you (from docs/decision-register.md)

- Survey-results review → re-rank Sprints 11–13 (the plan gates on this).
- Editorial oversight of AI-suggested verses: is the "Companion-suggested"
  marker enough, or do you want review before others see them?
- Privacy policy read (GDPR Art. 9 religious-data language; stores need it).
- Who recruits the 12 Play-closed-test beta testers from the ministry network.
- Apex (`lifengrace.com`) vs `app.` subdomain; store account timing
  (Apple $99/yr, Play $25 — slowest clocks in the plan).

## Working conventions

- 1-week sprints, ICE prioritization, single-developer cadence; plan docs in
  `docs/` are the source of truth and get their checkboxes updated as work
  lands.
- `npm run typecheck && npm run lint` before every commit; local end-to-end
  verification against the dev server for anything with a runtime surface.
- API changes: additive-only once mobile ships (see the policy doc).
- The repo's `.claude/skills/pr-review-expert` checklist runs before commits.

## Continuing with an AI session (copy-paste starter)

```
Work on the Life_n_Grace repo. Read docs/partner-handoff.md first, then
docs/sprint-plan-v2.4.md (the active plan — work its Status section top
down) and docs/decision-register.md (do not re-litigate settled decisions).
Current state: the claude/life-n-grace-post-demo-ugauw8 branch is ahead of
main and ready to merge; the deployed Lambda is stale until the deploy
session in the handoff's "immediate to-do" runs. Verify locally
(typecheck, lint, dev-server end-to-end) and commit with clear messages.
If the session has no AWS credentials, skip all AWS steps — never
reconfigure AWS access from a device not meant to hold it.
```
