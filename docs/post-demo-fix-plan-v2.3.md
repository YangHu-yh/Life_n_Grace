# Post-Demo Fix Plan — Life-n-Grace (v2.3)

> Committed to the repo (not just `~/.claude/plans/`) so it's resumable from any device/session, including a phone Claude Code session. Update the checkboxes below as work lands.

## Progress

- [x] 1. Reminders DELETE
- [ ] 2. Signup redirect + Google OAuth activation
- [ ] 3. Prayer Wall / Journal consistency fix
- [ ] 4. Prayer topics + companion panel
- [ ] `docs/project-plan.md` updated to v2.3 (mark done items, add new backlog)

---

## Context

The AWS demo deployment went live this session (Lambda + Function URL, Apologist companion AI activated end-to-end). Real hands-on testing of the live app surfaced four issues that the existing `docs/project-plan.md` either didn't anticipate or had explicitly deferred:

1. Signup doesn't redirect to sign-in, and Google sign-in's status is unclear.
2. The Prayer Wall and Journal Workspace look like duplicate views of the same data but are actually backed by two separate databases with only partial, one-directional sync — deleting or changing status in one doesn't propagate to the other. The existing plan's item **P4-5** ("merge dual databases — acceptable risk tradeoff") explicitly punted on this before real usage exposed how bad the UX impact is.
3. A "recommended verses / prayer topics" sidebar and an expandable, context-aware companion panel — features the user recalled from an old Django prototype (`main` branch) that were never ported to this Next.js rewrite.
4. Reminders can be created and edited but never deleted.

A recent internal mission-statement survey (going out to ministry contacts) frames the product around three pillars: **Consistency** (reminders), **Visualize Faithfulness** (answered-prayer tracking — directly implicated by issue 2), and **Suggest Scripture** (issue 3). That reprioritizes issue 2 and 3 above where the original ICE backlog placed them — issue 2 in particular stops being an acceptable tradeoff once it's actively undermining the core value prop in the founder's own testing.

This plan sequences fixes for all four issues, updates `docs/project-plan.md` to reflect what's shipped (AWS deploy, Apologist activation) and the newly reprioritized backlog, and calls out where a database migration/backfill is needed for already-live demo data.

**Decisions already confirmed with the user** (do not re-litigate):
- Rerouted lane → Journal status: maps to `HISTORY`.
- Journal Workspace's own Active/History toggle is **disabled for linked entries** — all status changes for a linked prayer go through the Wall's 4-lane selector, avoiding lossy collapse.
- List/rows view modes show prayers and their linked journal entries **interleaved in one list**, not as two sections that merely share a toggle.
- The new `/topics` page is **gated behind login**, consistent with every other feature page and protecting Apologist API quota.

**Reused per user's request**: `ship-gate`'s audit categories (security/DB/deploy/quality) from the locally cloned `claude-skills` repo, applied manually as a pre-merge checklist (not an invoked tool) — see Verification. `/pr-review-expert` runs before each commit in this plan. Existing ICE scoring stays the prioritization model (not RICE) for consistency with `docs/project-plan.md`.

---

## Recommended build order

1. **Reminders DELETE** — smallest, fully isolated, good warm-up.
2. **Signup redirect + Google OAuth activation** — small code change + an ops/infra checklist; can run in parallel with #3.
3. **Prayer Wall / Journal consistency fix** — highest-risk, most foundational; do before #4 since the topics/panel feature is simpler once the data model is coherent.
4. **Prayer topics + companion panel** — largest net-new scope, deliberately last.

---

## 1. Reminders DELETE

**Add:** `app/api/profile/reminders/[id]/route.ts` — `DELETE` handler mirroring `app/api/prayers/[id]/route.ts`'s pattern exactly: `getUserIdFromRequest`, `prismaMain.reminderSetting.deleteMany({ where: { id, userId } })`, 404 if `count === 0`, sanitized 500 on error.

**Edit:** `app/profile/page.tsx` (~lines 290-302) — add a `"button button-outline button-danger"` per reminder list item, using the same `window.confirm(...)` → `fetch(DELETE)` → reload pattern already used for prayer/journal deletion. If the deleted reminder's `id === reminderForm.id`, reset `reminderForm` to its blank default so a stale id doesn't silently resurrect via the next PUT.

No schema change needed.

---

## 2. Signup redirect + Google OAuth

**Edit:** `app/signup/page.tsx` — add `useRouter` (`next/navigation`); on `response.ok`, replace the inline `setMessage(...)` with `router.push(\`/login?justSignedUp=1&msg=${encodeURIComponent(data.message)}\`)`. Keep current behavior (no redirect) on failure.

**Edit:** `app/login/page.tsx` — extend the existing `URL_MESSAGES`/query-parsing `useEffect` to handle `justSignedUp=1`, preferring the passed-through `msg` (already correctly worded server-side — "check your email" vs "you can sign in now" depending on `isEmailConfigured()`), falling back to a default string. Rendered as a text node via `{message}` — no XSS risk from the query param.

**Google OAuth is already built** (`lib/security/google-oauth.ts`, `app/api/auth/google/route.ts` + `callback/route.ts`, `app/api/auth/providers/route.ts`, login page's conditional button) — this is an **ops/credentials checklist**, not new code:
1. Create an OAuth 2.0 Web application client in Google Cloud Console.
2. Register `https://<lambda-function-url-domain>/api/auth/google/callback` as an authorized redirect URI (exact match, no trailing slash), plus a separate dev-only client for `http://localhost:3000/...`.
3. Add `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to the existing `life-n-grace/app` Secrets Manager secret.
4. Edit `infra/lib/app-stack.ts` — add two `environment` lines mirroring the existing `APOLOGIST_API_KEY` pattern; `cdk deploy`. (Confirmed: this doesn't touch the `addFunctionUrl` construct, so the URL — and thus the registered redirect URI — stays stable.)
5. **Flag as a standing risk**, not part of this fix: Function URLs are stable only until the Lambda/stack is recreated. Recommend a follow-up (custom domain via Route53 + CloudFront) so the Google redirect URI never needs re-registering — track this as a new backlog item, don't build it now.
6. Post-deploy check: `GET /api/auth/providers` returns `{google:true}`; full consent round-trip creates `User`+`Account` rows; signing up by password then Google-signing-in with the same email links via existing upsert-by-email (no duplicate user); denied consent produces `?error=google_failed`, not a 500.

---

## 3. Prayer Wall / Journal consistency (the hard one)

**Confirmed via direct file read** (not just agent report): `lib/prayers/constants.ts` already has the exact enum-mapping precedent to follow (`LANE_TO_LEGACY_STAGE`/`LEGACY_STAGE_TO_LANE`). `app/api/prayers/overview/route.ts` already fetches both tables in one `Promise.all` and separately maps journals with their raw `status` — the natural seam for read-time reconciliation. `prisma/journal/schema.prisma`'s `relatedPrayerId String?` is confirmed to be a plain field, not a real FK (can't be, cross-database) — adding a sibling boolean column is straightforward.

**Two-layer fix — mutation-time cascade (primary) + read-time reconciliation (self-healing backstop):**

### 3a. Reconcile the enums — lane is canonical
Add to `lib/prayers/constants.ts`, same pattern as the existing map:
```ts
export const LANE_TO_JOURNAL_STATUS: Record<PrayerLane, "ACTIVE" | "HISTORY"> = {
  ACTIVE: "ACTIVE",
  ACCOMPLISHED: "HISTORY",
  REROUTED: "HISTORY",   // confirmed with user
  PRAISE: "HISTORY"
};
```
- `PATCH /api/prayers` (lane change): after the existing `prismaMain.prayerRequest.updateMany`, cascade `prismaJournal.journalEntry.updateMany({ where: { relatedPrayerId: id, userId }, data: { status: LANE_TO_JOURNAL_STATUS[lane] } })`.
- `app/prayers/page.tsx`: since the Journal's own toggle is now disabled for linked entries (confirmed decision), the PATCH `/api/journal/[id]` status-write path only needs to remain reachable for **unlinked** entries; when `relatedPrayerId` is set, the frontend hides/disables that control and shows the lane-derived `effectiveStatus` instead (read-only badge, sourced from 3b).

### 3b. Read-time reconciliation in `GET /api/prayers/overview`
After the existing `Promise.all` fetch: build a `Map<prayerId, PrayerRequest>`; for each journal entry with `relatedPrayerId`, compute `effectiveStatus = LANE_TO_JOURNAL_STATUS[prayer.lane]` and attach it to the response (always trust this over the raw stored `status` for linked entries). If the prayer isn't found (orphaned link, e.g. from before this fix), mark `orphaned: true` and null the relation so the UI can offer an "unlink" affordance. Batch-repair any drift found (`updateMany` per divergent target status) — cheap, deterministic, self-healing on next load.

### 3c. Distinguish auto-created vs. user-linked prayers (needed for correct delete direction)
**Schema change**, `prisma/journal/schema.prisma`:
```prisma
model JournalEntry {
  ...
  relatedPrayerId  String?
  ownsLinkedPrayer Boolean @default(false)   // NEW
  ...
}
```
Set `true` only in the `POST /api/journal` branch that auto-creates a new `PrayerRequest`; `false` when the client supplied an existing `relatedPrayerId`.

- `app/api/journal/[id]/route.ts` DELETE: fetch the entry first (need `relatedPrayerId`/`ownsLinkedPrayer` before deleting). If `ownsLinkedPrayer`, cascade-delete the linked `PrayerRequest` too, and detach any *other* journal entries pointing at that same prayer id. If not, delete only the journal entry (today's behavior is already correct for this case).
- `app/api/prayers/[id]/route.ts` DELETE: keep the existing detach-many call, add `ownsLinkedPrayer: false` to its `data`.
- **Partial-failure handling**: commit the user's directly-requested mutation first; wrap the counterpart write in `try/catch`. On failure, still return success for the primary action but include a `syncWarning` the frontend surfaces via its existing notice-banner state — 3b repairs it on next load regardless.

### 3d. One-time backfill for already-desynced demo data
New standalone script `scripts/backfill-journal-prayer-links.ts` (run manually once against RDS, **not** wired into CI/deploy):
- For every `JournalEntry` with `relatedPrayerId`: if the `PrayerRequest` is missing, null the link (self-heal orphans). If found, infer `ownsLinkedPrayer` via signature match (`prayer.topic === entry.title`, content/notes match, timestamps within ~10s — matches exactly what the auto-create path sets) and overwrite `JournalEntry.status` from the prayer's lane (lane is trusted as ground truth). Log a before/after summary for manual review.
- Migration: `prisma db push` (matches this project's existing schema-sync workflow — no `migrations/` folder, confirmed in the AWS deploy work) against `prisma/journal/schema.prisma` to add `ownsLinkedPrayer`, then run the backfill script once against the deployed RDS instance right after deploying the new code (the new column defaults safely to `false` in the interim).

### 3e. View-mode toggle + Expand All / Collapse All (`app/prayers/page.tsx`)
Reuses existing precedent only, no new library/framework:
- New state `viewMode: "columns" | "list" | "rows"` (default `"columns"` = today's kanban board), toggled via the same button-group-with-conditional-class pattern already used for the Journal's Active/History filter.
- Refactor the duplicated inline prayer-card JSX into a `renderPrayerCard(prayer, {compact})` helper so it renders across all three layouts without duplication.
- **Interleaved single list** (confirmed decision) for `list`/`rows` modes: each prayer shows with its linked journal entry nested/adjacent, sourced from the 3b reconciliation data — not two separate sections.
- Expand All / Collapse All: bulk-set every key in the existing `collapsedPrayerCards`/`collapsedJournalCards` state maps — zero new state shape.
- New CSS confined to existing tokens (`--surface-soft`, `--border`, `--radius-sm`) — no gradients, matches the "quiet design system" (warm paper, evergreen accent, hairline borders).

---

## 4. Prayer topics + companion-as-panel

**Data model**: static `lib/prayer-topics/topics.ts` (typed array + `getTopicBySlug()`/`listTopics()`), not a Prisma model — content changes rarely, avoids a third migration surface. Promote to a real model later only if in-app editing is needed.

**Pages**: `app/topics/page.tsx` (list of `.card` tiles) → `app/topics/[slug]/page.tsx` (verse + "Generate a short prayer" / "See another" buttons). **No new API route** — both buttons POST to the existing `/api/companion/chat` with a synthetic single-turn message and `prayerContext: {topic, notes: verseText}`; this plumbing already exists end-to-end in `lib/llm/apologist.ts`. Add `/topics/:path*` to `middleware.ts`'s auth-gate matcher (confirmed: gated behind login).

**Companion panel** (first reusable panel component in the codebase):
- `components/CompanionPanelProvider.tsx` — context holding `isOpen`/`open()`/`close()`/`pageContext`/`setPageContext()`.
- `components/CompanionPanel.tsx` — slide-out drawer reusing the existing modal precedent from `app/prayers/page.tsx` (`position:fixed`, `role="dialog"`, `.card` surface) anchored to the right edge instead of centered; internally reuses the streaming-fetch-reader logic already in `app/companion/page.tsx`.
- Mount once in `app/layout.tsx`, wrapped around `{children}`; add a persistent open trigger (header or fixed button).
- Additive, not a replacement: the existing full-page `/companion` route stays as the focused-session experience.
- **Add a rate-limit guard** to `/api/companion/chat` (reuse `lib/security/rate-limit.ts`, same pattern as `app/api/auth/signup/route.ts`) before this ships — currently there is no limiting at all on Apologist calls beyond auth, and this issue adds several new call sites. Full usage-tier gating (P3-3) stays out of scope.

---

## `docs/project-plan.md` updates (part of this work, not a separate task)

- Mark done: all `P0-AWS-*` items, `R11` (Apologist activation — closed, with the NAT-instance + dashboard-format detail from this session), the AWS demo deployment milestone itself.
- Revisit `P4-5` ("merge dual databases — acceptable risk tradeoff"): supersede with a note that full merge was rejected again in favor of the dual-write-cascade + reconciliation fix in section 3 above, preserving the deliberate encryption/security boundary.
- Add new backlog items for reminders-delete, signup-redirect, Google OAuth activation, the prayer/journal consistency fix, the topics/panel feature — ICE-scored consistent with the existing table's style.
- Note the custom-domain-for-OAuth-stability item as a new, lower-priority backlog entry (not built now).

---

## Verification

- `npm run typecheck && npm run lint` after each numbered section. This step needs no AWS credentials and is never optional.
- Local manual end-to-end per section (also credential-free, always required): (1) create a reminder, delete it, confirm it's gone and the form doesn't resurrect it; (2) sign up a fresh account against the local dev server, confirm redirect to `/login` with the right message; (3) locally create a linked prayer+journal pair, delete from each side, change lane/status from each side, confirm both the Wall and Workspace agree after a reload; (4) browse `/topics`, generate and regenerate a prayer for one topic, open the companion panel from at least two different pages and confirm `pageContext` flows into the request.
- Run `/pr-review-expert` before each commit (per user's request), and apply the `ship-gate` audit categories (security / DB / deploy / code quality relevant subset) as a manual pre-merge checklist for section 3 and 4 specifically, since they touch data integrity and a new public-facing route.
- Re-run the existing companion chat smoke test (signup → login → `/api/companion/chat`) after adding the rate-limit guard in section 4 to confirm it doesn't break the already-working flow.

### AWS deployment verification — **optional, only if AWS credentials/`AWS_PROFILE=claude` session are available in this environment**

If deploying from a session without AWS access (e.g. a phone/mobile Claude Code session), skip this subsection entirely — ship the local verification above, commit, and defer the AWS steps to a session where credentials exist. Do not attempt to reconfigure AWS credentials from a device that isn't meant to hold them.

When AWS access **is** available:
- Rebuild/push the image (`docker buildx build --platform linux/amd64 --provenance=false --sbom=false --push`) and update the Lambda (`aws lambda update-function-code`), per the pattern established in this session — remember `cdk deploy` alone does not pick up new image pushes or Secrets Manager value changes (see the CDK dynamic-reference caching gotcha recorded in memory).
- Run the `prisma db push` step for any schema change (section 3's `ownsLinkedPrayer` column) directly against the deployed RDS instance, using the same open→push→revoke transient security-group ingress pattern already used for the initial deployment.
- Run `scripts/backfill-journal-prayer-links.ts` against the deployed RDS instance (not local) exactly once, and check its summary output before relying on it.
- Complete the Google OAuth ops checklist (section 2) against the real Lambda Function URL domain — this step *requires* the live deployment and cannot be verified locally.
- Full live smoke test: signup → redirect → login → prayer wall/journal consistency check → topics/companion panel, all against the deployed Function URL.
