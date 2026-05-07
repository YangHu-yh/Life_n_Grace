# Authentication Spec — Email Verification + Google OAuth

**Version:** 1.0  
**Date:** 2026-05-06  
**Linked plan items:** P0-AUTH-1 through P1-AUTH-5  
**Security framework:** ISO 27001:2022 Clause 8.5 (Secure authentication), A.8.2 (Privileged access)  
**Privacy framework:** GDPR Art. 6(1)(b) contract, Art. 5(1)(e) storage limitation, Art. 17 erasure

---

## 1. Decision: Auth.js v5 (NextAuth) Replaces Custom JWT

The current custom JWT implementation in `lib/auth.ts` is production-quality for what it does, but it lacks the infrastructure for:
- Email verification tokens with expiry
- OAuth provider callbacks
- Session management beyond a single JWT cookie
- Password reset via verified email

**Auth.js v5** with the Prisma adapter covers all of this natively and is the standard for Next.js 14 App Router. The migration replaces `lib/auth.ts` entirely.

**Migration scope:** ~5 files changed (lib/auth.ts deleted, auth.ts added at root, middleware.ts updated, all API routes updated to use `auth()` instead of `getUserIdFromRequest()`)

---

## 2. Required Packages

```bash
npm install next-auth@beta @auth/prisma-adapter resend
npm install -D @types/nodemailer
```

| Package | Purpose |
|---------|---------|
| `next-auth@beta` | Auth.js v5 — credentials + Google OAuth |
| `@auth/prisma-adapter` | Stores sessions/accounts in Prisma |
| `resend` | Email API for verification emails (dev + staging) |
| AWS SES | Transactional email in production (see `aws-cicd-spec.md`) |

---

## 3. Database Schema Migration

The Auth.js Prisma adapter requires specific models. Apply this migration before any code changes.

**Updated `prisma/main/schema.prisma`:**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../generated/main"
}

datasource db {
  provider = "postgresql"
  url      = env("MAIN_DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  displayName   String?
  passwordHash  String?              // nullable — OAuth users have no password
  image         String?              // OAuth profile photo
  isPro         Boolean   @default(false)
  companionMessageCount Int @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts         Account[]
  sessions         Session[]
  prayerRequests   PrayerRequest[]
  reminderSettings ReminderSetting[]
  habitCheckins    HabitCheckin[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

// ... PrayerRequest, ReminderSetting, HabitCheckin unchanged
```

**Migration command:**
```bash
npm run prisma:migrate:main
# name: "add_authjs_oauth_email_verification"
```

---

## 4. Auth.js Configuration

Create `auth.ts` at project root:

```typescript
import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Google from "next-auth/providers/google"
import Credentials from "next-auth/providers/credentials"
import Resend from "next-auth/providers/resend"
import { prismaMain } from "@/lib/db/main"
import bcrypt from "bcryptjs"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prismaMain),
  session: { strategy: "jwt" },   // keep JWT strategy (stateless, works on Edge)

  providers: [
    // --- Google OAuth ---
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,  // merge accounts with same email
    }),

    // --- Email Magic Link (verification) ---
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from: process.env.EMAIL_FROM ?? "Life-n-Grace <noreply@lifengrace.com>",
    }),

    // --- Email + Password ---
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prismaMain.user.findUnique({
          where: { email: String(credentials.email) },
          select: { id: true, email: true, emailVerified: true, passwordHash: true, displayName: true }
        })

        if (!user?.passwordHash) return null

        // Block unverified email accounts from logging in
        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED")
        }

        const valid = await bcrypt.compare(String(credentials.password), user.passwordHash)
        if (!valid) return null

        return { id: user.id, email: user.email, name: user.displayName ?? user.email }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id
      return token
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string
      return session
    },
  },

  pages: {
    signIn: "/login",
    verifyRequest: "/verify-email",   // shown after magic link email is sent
    error: "/login",
  },
})
```

---

## 5. Email Verification Flow (Email + Password Signup)

### Flow Diagram

```
User fills signup form
        │
        ▼
POST /api/auth/signup
  - Validate email format + password strength
  - Check email not taken
  - Hash password with bcrypt(12)
  - Create User { emailVerified: null }
  - Generate verification token (crypto.randomBytes(32))
  - Store in VerificationToken table (expires 24h)
  - Send verification email via Resend/SES
  - Return { ok: true, message: "Check your email." }
        │
        ▼
User clicks link in email: /api/auth/verify-email?token=xxx
        │
        ▼
GET /api/auth/verify-email
  - Find VerificationToken by token
  - Check not expired
  - Set User.emailVerified = now()
  - Delete VerificationToken
  - Redirect to /login?verified=1
        │
        ▼
User logs in normally
```

### Signup Route — updated `app/api/auth/signup/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prismaMain } from "@/lib/db/main"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { sendVerificationEmail } from "@/lib/email"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000  // 24 hours

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 })
    }
    if (!EMAIL_RE.test(String(email))) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 })
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 })
    }

    const existing = await prismaMain.user.findUnique({ where: { email: String(email) } })
    if (existing) {
      // Return 200 to not leak whether email exists (security best practice)
      return NextResponse.json({ ok: true, message: "If this email is new, a verification link has been sent." })
    }

    const passwordHash = await bcrypt.hash(String(password), 12)
    const user = await prismaMain.user.create({
      data: { email: String(email), passwordHash, emailVerified: null }
    })

    // Create verification token
    const token = crypto.randomBytes(32).toString("hex")
    await prismaMain.verificationToken.create({
      data: {
        identifier: user.email,
        token,
        expires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS)
      }
    })

    await sendVerificationEmail(user.email, token)

    return NextResponse.json({ ok: true, message: "Check your email to verify your account." })
  } catch {
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 })
  }
}
```

### Email Verification Endpoint — new `app/api/auth/verify-email/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server"
import { prismaMain } from "@/lib/db/main"

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", request.url))
  }

  const record = await prismaMain.verificationToken.findUnique({ where: { token } })
  if (!record || record.expires < new Date()) {
    return NextResponse.redirect(new URL("/login?error=expired_token", request.url))
  }

  await prismaMain.user.update({
    where: { email: record.identifier },
    data: { emailVerified: new Date() }
  })
  await prismaMain.verificationToken.delete({ where: { token } })

  return NextResponse.redirect(new URL("/login?verified=1", request.url))
}
```

---

## 6. Email Service — `lib/email.ts`

Abstraction layer that uses Resend in development and AWS SES in production:

```typescript
import { Resend } from "resend"

const FROM = process.env.EMAIL_FROM ?? "Life-n-Grace <noreply@lifengrace.com>"
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

export async function sendVerificationEmail(to: string, token: string) {
  const link = `${BASE_URL}/api/auth/verify-email?token=${token}`

  if (process.env.NODE_ENV === "production" && process.env.EMAIL_PROVIDER === "ses") {
    return sendViaSES(to, "Verify your Life-n-Grace email", verificationEmailHtml(link))
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify your Life-n-Grace email",
    html: verificationEmailHtml(link),
  })
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${BASE_URL}/reset-password?token=${token}`

  if (process.env.NODE_ENV === "production" && process.env.EMAIL_PROVIDER === "ses") {
    return sendViaSES(to, "Reset your Life-n-Grace password", resetEmailHtml(link))
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({ from: FROM, to, subject: "Reset your Life-n-Grace password", html: resetEmailHtml(link) })
}

async function sendViaSES(to: string, subject: string, html: string) {
  const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses")
  const ses = new SESClient({ region: process.env.AWS_REGION ?? "us-east-1" })
  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: html } }
    }
  }))
}

function verificationEmailHtml(link: string) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
      <h2>Verify your email</h2>
      <p>Click the button below to verify your Life-n-Grace account. This link expires in 24 hours.</p>
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#1a56db;color:#fff;border-radius:6px;text-decoration:none">Verify email</a>
      <p style="margin-top:24px;color:#6b7280;font-size:14px">If you didn't sign up, you can safely ignore this email.</p>
    </div>
  `
}

function resetEmailHtml(link: string) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
      <h2>Reset your password</h2>
      <p>Click the button below to choose a new password. This link expires in 1 hour.</p>
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#1a56db;color:#fff;border-radius:6px;text-decoration:none">Reset password</a>
      <p style="margin-top:24px;color:#6b7280;font-size:14px">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `
}
```

---

## 7. Google OAuth Setup

### Google Cloud Console Steps

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://yourdomain.com/api/auth/callback/google` (prod)
4. Copy Client ID and Client Secret to env vars

### Required Env Vars

```dotenv
# .env.local (never commit)
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
NEXTAUTH_SECRET="replace-with-openssl-rand-hex-32"
NEXTAUTH_URL="http://localhost:3000"  # change to prod URL in production

# Email
RESEND_API_KEY="re_your_resend_key"         # dev/staging
EMAIL_FROM="Life-n-Grace <noreply@lifengrace.com>"
EMAIL_PROVIDER="resend"                      # "ses" in production
```

### Route Handler

Create `app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

---

## 8. Updated Login Page

Add Google sign-in button alongside the existing form:

```typescript
"use client"
import { signIn } from "next-auth/react"

// Inside the login form component:
<button
  type="button"
  className="button button-outline"
  onClick={() => signIn("google", { callbackUrl: "/prayers" })}
>
  Continue with Google
</button>
```

Display contextual messages from URL params:
- `?verified=1` → "Email verified! You can now sign in."
- `?error=EMAIL_NOT_VERIFIED` → "Please verify your email first. Check your inbox."

---

## 9. Update All API Routes

Replace `getUserIdFromRequest(request)` with Auth.js `auth()`:

```typescript
// Before (custom JWT)
import { getUserIdFromRequest } from "@/lib/auth"
const userId = await getUserIdFromRequest(request)

// After (Auth.js)
import { auth } from "@/auth"
const session = await auth()
const userId = session?.user?.id
```

Affected routes: prayers, journal, habits, companion/chat, profile/*, prayers/overview.

---

## 10. Middleware Update

Replace the custom `middleware.ts` with Auth.js middleware:

```typescript
// middleware.ts
export { auth as middleware } from "@/auth"

export const config = {
  matcher: ["/prayers/:path*", "/companion/:path*", "/profile/:path*"],
}
```

---

## 11. ISO 27001 Security Controls Applied

| Control | ISO 27001 Ref | Implementation |
|---------|--------------|----------------|
| Password strength minimum | A.8.5 | 8-char minimum enforced server-side |
| Credential storage | A.8.5 | bcrypt(12) — computationally expensive hash |
| Session expiry | A.8.5 | Auth.js JWT with configurable maxAge |
| Account enumeration prevention | A.8.2 | Signup returns 200 regardless of whether email exists |
| Email not verified = no access | A.8.2 | `authorize()` throws if `emailVerified` is null |
| Secrets in env not code | A.8.10 | `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_SECRET` — never committed |
| Audit log (session events) | A.8.15 | Auth.js logs sign-in, sign-out, token refresh events |

---

## 12. GDPR Compliance Notes

| Requirement | GDPR Article | Implementation |
|-------------|-------------|----------------|
| Lawful basis for email storage | Art. 6(1)(b) | Contract — email is required to deliver the service |
| Email verification = confirmed consent | Art. 7 | User must click link; unverified = no account access |
| Right to erasure | Art. 17 | DELETE endpoints for prayers + journal + account deletion endpoint |
| Data minimization | Art. 5(1)(c) | Collect only email + password; displayName is optional |
| No personal data in logs | Art. 5(1)(f) | `lib/email.ts` logs event type only, not email address |
| Google OAuth data | Art. 28 | Google is a processor; link their DPA in your privacy policy |

**DPIA trigger assessment:** Life-n-Grace processes religious beliefs data (prayer content) which is **special category data under Art. 9**. Journal encryption provides a technical safeguard, but a DPIA is recommended before public launch. The journal's client-side encryption or a note clarifying server-side encryption with user-controlled keys would strengthen the Art. 9 position.

---

## 13. Account Deletion (Required for GDPR Art. 17)

Add `DELETE /api/auth/account` endpoint:

```typescript
export async function DELETE(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 })

  const userId = session.user.id

  // Delete all user data (cascade handles related records)
  await prismaJournal.journalEntry.deleteMany({ where: { userId } })
  await prismaMain.user.delete({ where: { id: userId } })

  return NextResponse.json({ ok: true })
}
```

Schema must have `onDelete: Cascade` on all User relations (add to existing schema).
