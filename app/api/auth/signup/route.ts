import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prismaMain } from "@/lib/db/main";
import { hashPassword } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { isEmailConfigured, sendVerificationEmail } from "@/lib/email";

const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 60_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Identical response whether or not the email already exists — prevents
// account enumeration (ISO 27001 A.8.2).
const GENERIC_OK = {
  ok: true,
  message: "Account request received. Check your email for a verification link."
};

export async function POST(request: NextRequest) {
  try {
    const rate = checkRateLimit(
      `signup:${getClientIp(request)}`,
      SIGNUP_LIMIT,
      SIGNUP_WINDOW_MS
    );
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rate.retryAfterSeconds) }
        }
      );
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(String(email))) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }
    if (String(password).length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const emailDeliveryOn = isEmailConfigured();

    const existing = await prismaMain.user.findUnique({
      where: { email: String(email) }
    });
    if (existing) {
      return emailDeliveryOn
        ? NextResponse.json(GENERIC_OK)
        : NextResponse.json({ ok: true, message: "Account created. You can sign in." });
    }

    const passwordHash = await hashPassword(String(password));
    const user = await prismaMain.user.create({
      data: {
        email: String(email),
        passwordHash,
        // Until an email provider is configured, verification links cannot be
        // delivered — auto-verify so demo accounts are not locked out. Once
        // RESEND_API_KEY or SES is set, new signups must verify.
        emailVerified: emailDeliveryOn ? null : new Date()
      }
    });

    if (emailDeliveryOn) {
      const token = crypto.randomBytes(32).toString("hex");
      await prismaMain.verificationToken.create({
        data: {
          identifier: user.email,
          token,
          expires: new Date(Date.now() + VERIFY_TOKEN_TTL_MS)
        }
      });
      const verifyLink = `${request.nextUrl.origin}/api/auth/verify-email?token=${token}`;
      await sendVerificationEmail(user.email, verifyLink);
      return NextResponse.json(GENERIC_OK);
    }

    return NextResponse.json({ ok: true, message: "Account created. You can sign in." });
  } catch (error) {
    console.error("[POST /api/auth/signup]", error);
    return NextResponse.json({ error: "Signup failed." }, { status: 500 });
  }
}
