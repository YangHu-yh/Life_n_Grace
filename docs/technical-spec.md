# Life-n-Grace — Technical Specification

**Version:** 1.0  
**Date:** 2026-05-06  
**Reference:** [project-plan.md](project-plan.md)

---

## 1. Current Architecture

```
Next.js 14 App Router (TypeScript)
├── app/
│   ├── api/                     # Route Handlers (server-side)
│   │   ├── auth/                # login, signup, logout, me, forgot-password
│   │   ├── prayers/             # CRUD + overview aggregation
│   │   ├── journal/             # CRUD (encrypted)
│   │   ├── habits/              # checkin GET/POST
│   │   ├── companion/chat/      # LLM proxy
│   │   └── profile/             # user, password, reminders
│   └── [pages]/                 # All "use client" — no SSR
├── lib/
│   ├── auth.ts                  # JWT (jose), bcrypt, cookie helpers
│   ├── db/main.ts               # Prisma client (main DB)
│   ├── db/journal.ts            # Prisma client (journal DB)
│   ├── llm/apologist.ts         # LLM proxy (OpenAI-compatible API)
│   └── security/encryption.ts  # AES-256-GCM encrypt/decrypt
├── prisma/
│   ├── main/schema.prisma       # User, PrayerRequest, ReminderSetting, HabitCheckin
│   └── journal/schema.prisma   # JournalEntry (separate DB)
└── components/
    └── SiteHeader.tsx
```

**Two PostgreSQL databases:**
- `life_n_grace_main` — user identity, prayer requests, habit checkins, reminder settings
- `life_n_grace_journal` — encrypted journal entries (intentionally isolated)

---

## 2. P0 Specifications — Security Hardening

### P0-1: Secret Rotation & `.env` Sanitization

**Problem:** `.env` contains what appear to be real hex-encoded JWT and encryption secrets committed to source.

**Action:**
1. Rotate `AUTH_JWT_SECRET` (generate new 64-char hex: `openssl rand -hex 32`)
2. Rotate `JOURNAL_ENCRYPTION_KEY` (generate new 64-char hex: `openssl rand -hex 32`)
3. Update `.env` on the deployed server / secret manager
4. Replace `.env` file in repo with placeholder values only

```dotenv
# .env (committed — placeholders only)
MAIN_DATABASE_URL="postgresql://user:pass@localhost:5432/life_n_grace_main"
JOURNAL_DATABASE_URL="postgresql://user:pass@localhost:5432/life_n_grace_journal"
AUTH_JWT_SECRET="replace-with-64-char-hex-openssl-rand-hex-32"
JOURNAL_ENCRYPTION_KEY="replace-with-64-char-hex-openssl-rand-hex-32"
APOLOGIST_API_KEY="replace-with-your-key"
APOLOGIST_API_URL="https://your-agent-domain/api/v1"
APOLOGIST_MODEL_ID="openai/gpt/4o"
APOLOGIST_TRANSLATION="esv"
```

> Note: rotating `JOURNAL_ENCRYPTION_KEY` means existing encrypted journal entries cannot be decrypted with the new key. If there is live user data, the migration path is: (a) decrypt all entries with the old key, (b) re-encrypt with the new key, (c) swap the key. Do not rotate without this step if real user data exists.

---

### P0-2: Rate Limiting on Auth Endpoints

**Package:** `@upstash/ratelimit` + `@upstash/redis` (or `lru-cache` for local-only, no Redis dependency)

**Simple in-memory option (no external service):**

```typescript
// lib/rate-limit.ts
import { LRUCache } from 'lru-cache'

type Options = { interval: number; uniqueTokenPerInterval: number }

export function rateLimit({ interval, uniqueTokenPerInterval }: Options) {
  const tokenCache = new LRUCache<string, number[]>({
    max: uniqueTokenPerInterval,
    ttl: interval,
  })

  return {
    check: (limit: number, token: string) => {
      const tokenCount = tokenCache.get(token) ?? [0]
      if (tokenCount[0] === 0) tokenCache.set(token, tokenCount)
      tokenCount[0] += 1
      const currentUsage = tokenCount[0]
      const isRateLimited = currentUsage >= limit
      return { isRateLimited, limit, remaining: Math.max(0, limit - currentUsage) }
    },
  }
}
```

**Apply to login and signup:**

```typescript
// app/api/auth/login/route.ts
import { rateLimit } from '@/lib/rate-limit'

const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 })

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'anonymous'
  const { isRateLimited } = limiter.check(5, ip)  // 5 attempts per minute per IP
  if (isRateLimited) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }
  // ... existing logic
}
```

**Limits:**
- Login: 5 requests / minute / IP
- Signup: 3 requests / minute / IP
- Forgot password: 3 requests / minute / IP

---

### P0-3: Sanitize 500 Error Responses

**Problem:** Routes return `error instanceof Error ? error.message : "..."` which leaks stack traces and internal messages.

**Fix — replace all catch blocks:**

```typescript
// Before (leaks internals)
} catch (error) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Login failed." },
    { status: 500 }
  )
}

// After (safe)
} catch (error) {
  console.error('[POST /api/auth/login]', error)
  return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 })
}
```

Affected files: all route files with catch blocks (`login`, `signup`, `prayers`, `journal`, `companion/chat`, `profile/*`).

---

### P0-4: DELETE Endpoints

**`DELETE /api/prayers/[id]`** — new file `app/api/prayers/[id]/route.ts`

```typescript
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const deleted = await prismaMain.prayerRequest.deleteMany({
    where: { id: params.id, userId }
  })
  if (deleted.count === 0) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
```

**`DELETE /api/journal/[id]`** — add to existing `app/api/journal/[id]/route.ts`

```typescript
export async function DELETE(request: NextRequest, context: RouteContext) {
  const userId = await getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const existing = await prismaJournal.journalEntry.findUnique({ where: { id: context.params.id } })
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  await prismaJournal.journalEntry.delete({ where: { id: context.params.id } })
  return NextResponse.json({ ok: true })
}
```

---

## 3. P1 Specifications — Architecture

### P1-1: Shared Prayer Constants

Create `lib/prayers/constants.ts`:

```typescript
export const VALID_LANES = ['ACTIVE', 'ACCOMPLISHED', 'REROUTED', 'PRAISE'] as const
export type PrayerLane = (typeof VALID_LANES)[number]

export const LANE_TO_STAGE: Record<PrayerLane, 'SEED' | 'BLOOM'> = {
  ACTIVE: 'SEED',
  ACCOMPLISHED: 'BLOOM',
  REROUTED: 'SEED',
  PRAISE: 'SEED',
}

export const STAGE_TO_LANE: Record<string, PrayerLane> = {
  SEED: 'ACTIVE',
  SPROUT: 'ACTIVE',
  BLOOM: 'ACCOMPLISHED',
}

export function isPrayerLane(value: unknown): value is PrayerLane {
  return typeof value === 'string' && (VALID_LANES as readonly string[]).includes(value)
}
```

Remove all inline copies from `app/api/prayers/route.ts` and `app/api/journal/route.ts`.

---

### P1-2: Environment Validation

Install: `npm install zod`

Create `lib/env.ts`:

```typescript
import { z } from 'zod'

const envSchema = z.object({
  MAIN_DATABASE_URL: z.string().min(1),
  JOURNAL_DATABASE_URL: z.string().min(1),
  AUTH_JWT_SECRET: z.string().min(32),
  JOURNAL_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-f]+$/),
  APOLOGIST_API_KEY: z.string().min(1),
  APOLOGIST_API_URL: z.string().url(),
  APOLOGIST_MODEL_ID: z.string().default('openai/gpt/4o'),
  APOLOGIST_TRANSLATION: z.string().default('esv'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export const env = envSchema.parse(process.env)
```

Import `env` from `lib/env.ts` in all files that currently access `process.env` directly.

---

### P1-3: Auth Middleware

Create `middleware.ts` at project root:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const PROTECTED = ['/prayers', '/companion', '/profile']
const TOKEN_COOKIE = 'auth_token'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!PROTECTED.some((path) => pathname.startsWith(path))) return

  const token = request.cookies.get(TOKEN_COOKIE)?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))

  try {
    const secret = new TextEncoder().encode(process.env.AUTH_JWT_SECRET!)
    await jwtVerify(token, secret)
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}

export const config = { matcher: ['/prayers/:path*', '/companion/:path*', '/profile/:path*'] }
```

---

### P1-4: Split PATCH Prayer Route

**Current problem:** `PATCH /api/prayers` handles both "move to lane" and "mark prayed" via the same body, distinguished by `markPrayed: true`. This violates single responsibility and makes clients fragile.

**New structure:**

```
PATCH /api/prayers/[id]         body: { lane }              → move to lane
POST  /api/prayers/[id]/prayed  body: {}                    → record prayer event
```

**Files to create/modify:**
- Create `app/api/prayers/[id]/route.ts` — PATCH (lane) + DELETE
- Create `app/api/prayers/[id]/prayed/route.ts` — POST
- Deprecate `PATCH /api/prayers` (keep temporarily, add deprecation comment)

**`app/api/prayers/[id]/prayed/route.ts`:**

```typescript
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserIdFromRequest(request)
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const today = startOfTodayUtc()
  const updated = await prismaMain.prayerRequest.updateMany({
    where: { id: params.id, userId },
    data: { prayerCount: { increment: 1 }, lastPrayedAt: new Date() }
  })
  if (updated.count === 0) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  await prismaMain.habitCheckin.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, completed: true },
    update: { completed: true }
  })

  const prayer = await prismaMain.prayerRequest.findUnique({ where: { id: params.id } })
  return NextResponse.json({ prayer })
}
```

---

### P1-5: Pagination

Add cursor-based pagination to list endpoints:

```typescript
// GET /api/prayers?cursor=<cuid>&limit=20
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100)

  const prayers = await prismaMain.prayerRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
  })

  const hasMore = prayers.length > limit
  return NextResponse.json({
    prayers: hasMore ? prayers.slice(0, limit) : prayers,
    nextCursor: hasMore ? prayers[limit - 1].id : null,
  })
}
```

Same pattern for `GET /api/journal`.

---

### P1-6: Input Validation

Add to prayer and journal POST/PATCH handlers:

```typescript
// Validate before any DB call
if (topic && String(topic).length > 500) {
  return NextResponse.json({ error: 'Topic must be 500 characters or fewer.' }, { status: 400 })
}
if (content && String(content).length > 50_000) {
  return NextResponse.json({ error: 'Content must be 50,000 characters or fewer.' }, { status: 400 })
}
if (notes && String(notes).length > 2000) {
  return NextResponse.json({ error: 'Notes must be 2,000 characters or fewer.' }, { status: 400 })
}
```

---

### P1-7: Retire PrayerStage Enum

**Migration plan:**
1. Verify all `prayerRequest` rows have a valid `lane` value (query: `SELECT stage, lane, COUNT(*) FROM "PrayerRequest" GROUP BY stage, lane`)
2. Create migration: `ALTER TABLE "PrayerRequest" DROP COLUMN "stage"` (after removing from schema)
3. Remove `PrayerStage` enum from `prisma/main/schema.prisma`
4. Remove `stage` field from `PrayerRequest` model
5. Delete `STAGE_TO_LANE` and `LANE_TO_STAGE` constants (no longer needed)
6. Remove all `stage` references from route handlers

> Do not perform this migration until all translation code is confirmed unused and rows verified.

---

## 4. P2 Specifications — Product Quality

### P2-1: Component Decomposition

Break `app/prayers/page.tsx` (714 lines) into:

```
app/prayers/
├── page.tsx                    ~80 lines  (layout, data fetch, state root)
├── components/
│   ├── PrayerWall.tsx          ~150 lines (kanban board, drag-drop)
│   ├── PrayerCard.tsx          ~80 lines  (single prayer card)
│   ├── JournalWorkspace.tsx    ~120 lines (journal list + filter)
│   ├── JournalCard.tsx         ~60 lines  (single journal card)
│   ├── JournalModal.tsx        ~100 lines (create journal form)
│   └── HabitSummary.tsx        ~40 lines  (streak stats)
```

---

### P2-2: Optimistic Updates with SWR

Install: `npm install swr`

```typescript
// hooks/usePrayers.ts
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function usePrayerOverview() {
  const { data, error, mutate } = useSWR('/api/prayers/overview', fetcher)

  async function movePrayerLane(prayerId: string, lane: PrayerLane) {
    // Optimistic update
    mutate(
      current => ({
        ...current,
        prayerBoard: reorderBoard(current.prayerBoard, prayerId, lane)
      }),
      false
    )
    await fetch(`/api/prayers/${prayerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lane })
    })
    mutate() // revalidate
  }

  return { data, error, movePrayerLane }
}
```

---

### P2-3: Mobile Touch Interactions

Add a fallback interaction model for mobile alongside drag-and-drop:

```typescript
// State for tap-to-select on mobile
const [selectedPrayerId, setSelectedPrayerId] = useState<string | null>(null)

// On mobile: tap card to select, tap lane header to move
function handleCardTap(prayerId: string) {
  if (isMobile()) setSelectedPrayerId(prev => prev === prayerId ? null : prayerId)
}

function handleLaneHeaderTap(lane: PrayerLane) {
  if (selectedPrayerId && isMobile()) {
    void updatePrayerLane(selectedPrayerId, lane)
    setSelectedPrayerId(null)
  }
}

function isMobile() {
  return window.matchMedia('(pointer: coarse)').matches
}
```

Visual: selected card gets a highlight ring; lane headers show "Move here" affordance when a card is selected.

---

### P2-7: Overview Endpoint Optimization

**Current:** 3 unbounded queries → JS-side filtering.

**Optimized:** Add `take` limits; push board grouping to DB level.

```typescript
// Add take limits to all three parallel queries
const [prayers, journals, prayedCheckins] = await Promise.all([
  prismaMain.prayerRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 200  // reasonable upper bound per user
  }),
  prismaJournal.journalEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, title: true, ciphertext: true, iv: true, status: true,
              relatedPrayerId: true, sourceLinks: true, createdAt: true, updatedAt: true }
  }),
  prismaMain.habitCheckin.findMany({
    where: { userId, completed: true, date: { gte: last30Start } }, // only last 30 days needed
    orderBy: { date: 'desc' },
    select: { date: true }
  })
])
```

---

## 5. P3 Specifications — Strategic Features

### P3-1: Prayer-Context Companion Integration

Pass the prayer context into the system prompt when companion is opened from a prayer card:

```typescript
// app/api/companion/chat/route.ts
export async function generatePrayerChat(
  messages: ApologistMessage[],
  prayerContext?: { topic: string; notes?: string }
) {
  const contextClause = prayerContext
    ? ` The user is praying about: "${prayerContext.topic}".${prayerContext.notes ? ` Notes: "${prayerContext.notes}".` : ''}`
    : ''

  return callApologist([
    {
      role: 'system',
      content: `You are an encouraging prayer guide for beginner Christians.${contextClause} Respond with a short ${translation} Bible verse reference, a short sample prayer, and a gentle note to ask the Holy Spirit for guidance.`
    },
    ...messages
  ])
}
```

Client: `<Link href={/companion?prayerId=${prayer.id}>Open Companion</Link>` — companion page reads query param and sends prayer context in first message.

---

### P3-2: Social Login with Auth.js

Install: `npm install next-auth@beta`

Auth.js (v5 beta) integrates natively with Next.js App Router. Add Google and Apple providers. Map OAuth identity to existing `User` model via email or create new user on first sign-in.

Key consideration: existing users have `passwordHash` required in schema. Make `passwordHash` optional to support OAuth-only accounts.

---

### P3-3: Companion Usage Gate

Add `companionMessages` count to `User` model:

```prisma
model User {
  // ...existing fields
  companionMessageCount Int      @default(0)
  isPro                 Boolean  @default(false)
  proSince              DateTime?
}
```

Gate in `/api/companion/chat/route.ts`:

```typescript
const FREE_LIMIT = 10

const user = await prismaMain.user.findUnique({ where: { id: userId }, select: { companionMessageCount: true, isPro: true } })
if (!user?.isPro && (user?.companionMessageCount ?? 0) >= FREE_LIMIT) {
  return NextResponse.json(
    { error: 'Free companion limit reached. Upgrade to Pro for unlimited access.', upgradeRequired: true },
    { status: 402 }
  )
}
await prismaMain.user.update({ where: { id: userId }, data: { companionMessageCount: { increment: 1 } } })
```

---

### P3-4: CI Pipeline

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test -- --passWithNoTests
```

---

## 6. Database Schema — Target State (after P1-7)

### `prisma/main/schema.prisma` (PrayerStage removed)

```prisma
model PrayerRequest {
  id            String      @id @default(cuid())
  userId        String
  topic         String      @db.VarChar(500)
  notes         String?     @db.VarChar(2000)
  lane          PrayerLane  @default(ACTIVE)
  prayerCount   Int         @default(0)
  lastPrayedAt  DateTime?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, lane, createdAt(sort: Desc)])
}

enum PrayerLane {
  ACTIVE
  ACCOMPLISHED
  REROUTED
  PRAISE
}
```

Note: `onDelete: Cascade` added so deleting a user cascades to their prayers.

---

## 7. API Surface — Target State

```
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/forgot-password

GET    /api/prayers?cursor=&limit=          (paginated)
POST   /api/prayers
PATCH  /api/prayers/[id]                   body: { lane }
POST   /api/prayers/[id]/prayed            body: {}
DELETE /api/prayers/[id]

GET    /api/prayers/overview               (bounded, max 200 per type)

GET    /api/journal?status=&cursor=&limit= (paginated)
POST   /api/journal
PATCH  /api/journal/[id]
DELETE /api/journal/[id]

GET    /api/habits
POST   /api/habits

POST   /api/companion/chat                 body: { messages, prayerContext? }

GET    /api/profile
PUT    /api/profile
POST   /api/profile/password
GET    /api/profile/reminders
PUT    /api/profile/reminders
```

---

## 8. Deployment Target

| Layer | Service | Notes |
|-------|---------|-------|
| Frontend + API | Vercel | Native Next.js support, zero-config |
| Main DB | Neon (PostgreSQL) | Serverless Postgres, generous free tier |
| Journal DB | Neon (second project) | Keep isolated per architecture decision |
| Secrets | Vercel env vars | Never committed to git |
| LLM API | Apologist / OpenAI-compatible | Existing integration |
| Error tracking | Sentry | Add `@sentry/nextjs` |
| CI | GitHub Actions | `.github/workflows/ci.yml` |
