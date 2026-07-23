# Decision Register & Partner Agenda

> Living doc (same convention as the plan docs — update as decisions land).
> Created when `lifengrace.com` was acquired; pairs with
> `sprint-plan-v2.4.md` (execution) and `mobile-app-plan.md` (mobile detail).

## Decided (do not re-litigate)

| Decision | Choice | Where |
|---|---|---|
| Prayers page default view | Kanban wall (List is the toggle) | e5c4b9a revert |
| Linked journal status | Follows the wall card's lane (lane canonical) | v2.3 §3 |
| Dual databases | Keep split + cascade/reconciliation (no merge) | P4-5 superseded |
| Auth token lifetime | 30 days, one TTL for web + mobile; refresh endpoint deferred | S9/G6 |
| Mobile framework | Expo managed + EAS; Expo Go for Phase 1 only, dev builds from Phase 2 | mobile plan |
| AI cost floor | 10 generations/user/day (env-tunable), fallbacks free; no paywall yet | S11/G12 |
| Email provider path | Temp Gmail over SMTP now → SES + noreply@lifengrace.com after domain cutover | DEPLOYMENT.md |
| API stance | Additive-only once mobile ships; no /v1 prefix | api-compatibility-policy.md |
| Domain | **lifengrace.com** | this doc |

## Open — owner decisions (you)

1. **Domain shape**: serve the app at the apex (`lifengrace.com`) or a
   subdomain (`app.lifengrace.com`, keeping the apex for a future marketing
   page)? Current runbook assumes the apex; say the word to flip it.
2. **DNS home**: move nameservers to Route53 (assumed by the CDK runbook —
   simplest) or keep them at the registrar and hand-validate certs?
3. **Store accounts** (G10, blocks Phase 4 + the 14-day Play closed test):
   when to pay Apple ($99/yr) and Play ($25 one-time) and start the clocks.
4. **AI daily limit**: is 10/day right for beta? (One env value to change.)
5. **Cutover timing**: the domain cutover (deploy + OAuth re-registration +
   SES) is one credentialed session — schedule it before the first store
   build so the binary bakes in the right URL.

## Partner discussion agenda

1. **Survey results checkpoint (G13)** — the plan gates Sprints 11-13 scope
   on what ministry contacts said. Review together, re-rank if needed.
2. **Verse content review** — 70 curated verses now ship per-topic, and
   Companion can suggest more (marked "Companion-suggested", stored in a
   shared library). Does the partner want editorial review of AI-suggested
   verses before they're shown to others, or is the marker enough?
3. **Privacy policy content (S8/G4)** — needs a human read for GDPR Art. 9
   (religious data) language; also required verbatim for both store listings.
4. **Beta testers** — Play's closed test needs 12 testers for 14 days;
   partner's ministry contacts are the natural pool. Who invites, and when?
5. **Reminder experience** — email reminders now deliver; local phone
   notifications arrive in mobile Phase 3. Is email-first acceptable for the
   partner's community in the interim?
6. **Store presence** — app name ("Life-n-Grace"?), icon, screenshots, short
   description; who owns the store listing copy.
7. **Companion tone/quality** — the topic-prayer prompt was overhauled after
   the demo error; worth a fresh pass together on the live site after the
   next deploy.
